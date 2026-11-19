#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SHICI_TEST_PORT:-4184}"
SESSION="shici-learned-review-test-$$"
STATE_DIR="$(mktemp -d)"
CONFIG_PATH="${SHICI_PLAYWRIGHT_CONFIG:-}"
CONFIG_ARGS=()
PWCLI=(npx --yes --package @playwright/cli playwright-cli)

if [[ -z "$CONFIG_PATH" ]]; then
  CHROME_PATH="$(find "$HOME/Library/Caches/ms-playwright" -path '*Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' -print -quit 2>/dev/null || true)"
  if [[ -n "$CHROME_PATH" ]]; then
    CONFIG_PATH="$STATE_DIR/playwright.json"
    python3 - "$CONFIG_PATH" "$CHROME_PATH" <<'PY'
import json
import sys

path, executable = sys.argv[1:]
with open(path, "w", encoding="utf-8") as handle:
    json.dump({
        "browser": {
            "launchOptions": {"headless": True, "executablePath": executable},
            "contextOptions": {"viewport": {"width": 1280, "height": 900}},
        }
    }, handle)
PY
  fi
fi

if [[ -n "$CONFIG_PATH" ]]; then
  CONFIG_ARGS=(--config "$CONFIG_PATH")
fi

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  "${PWCLI[@]}" -s="$SESSION" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

cd "$ROOT"
SHICI_PORT="$PORT" SHICI_STATE_DIR="$STATE_DIR" python3 serve.py >/dev/null 2>&1 &
SERVER_PID=$!

for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

"${PWCLI[@]}" -s="$SESSION" open "http://127.0.0.1:$PORT/#study" "${CONFIG_ARGS[@]}" >/dev/null
"${PWCLI[@]}" -s="$SESSION" run-code 'async (page) => {
  await page.evaluate(async () => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel() {}, getVoices() { return []; }, speak() {} }
    });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = String(text); } };

    const appScript = document.querySelector("script[src*=\"js/app.js\"]");
    const version = appScript ? new URL(appScript.src).searchParams.get("v") : "";
    const loadBook = id => new Promise((resolve, reject) => {
      if (window.__SHICI_BOOKS__ && window.__SHICI_BOOKS__[id]) return resolve(window.__SHICI_BOOKS__[id]);
      const script = document.createElement("script");
      script.src = `data/books/${id}.js${version ? `?v=${version}` : ""}`;
      script.onload = () => resolve(window.__SHICI_BOOKS__[id]);
      script.onerror = reject;
      document.head.appendChild(script);
    });

    for (const meta of window.BOOKS) {
      const payload = await loadBook(meta.id);
      Store.activateBook(meta.id, payload);
      const fresh = Store.newWords().slice(0, 50);
      fresh.forEach((word, index) => Store.answerWord(word.id, index === 0 ? "again" : "known", 1));
    }
  });
}' >/dev/null

RESULT="$("${PWCLI[@]}" -s="$SESSION" eval '() => {
  const books = {};
  for (const meta of window.BOOKS) {
    const payload = window.__SHICI_BOOKS__[meta.id];
    Store.activateBook(meta.id, payload);
    const expected = Store.studiedWords().length;
    const queue = typeof Store.buildLearnedReviewQueue === "function" ? Store.buildLearnedReviewQueue() : null;
    const weak = queue ? queue.map(item => Boolean((Store.getRecord(item.id) || {}).weak)) : [];
    const firstNotWeak = weak.indexOf(false);
    books[meta.id] = {
      expected,
      actual: queue ? queue.length : null,
      allLearned: queue ? queue.every(item => Boolean(Store.hasRecord(item.id))) : false,
      weakFirst: firstNotWeak === -1 || weak.slice(firstNotWeak).every(value => value === false)
    };
  }
  return { books, activeBook: Store.getActiveBookId() };
}' --raw)"

python3 - "$RESULT" <<'PY'
import json
import sys

result = json.loads(sys.argv[1])
books = result["books"]
assert set(books) == {"gaokao", "curated", "wenyan", "ielts", "cet4", "cet6"}, books
for book_id, state in books.items():
    assert state["actual"] == state["expected"], f"{book_id}: learned review must include every learned word: {state}"
    assert state["allLearned"], f"{book_id}: learned review included an unstudied word: {state}"
    assert state["weakFirst"], f"{book_id}: weak words must be shown first: {state}"
print(json.dumps({"ok": True, "books": books}, ensure_ascii=False))
PY

"${PWCLI[@]}" -s="$SESSION" run-code 'async (page) => {
  await page.reload();
  await page.waitForSelector(".mode-grid");
  const modeCount = await page.locator(".mode-card").count();
  const indexes = await page.locator(".mode-card__index").allTextContents();
  if (modeCount !== 2 || indexes.some((text) => !text.endsWith("/ 02"))) {
    throw new Error(`mode count/index mismatch: ${modeCount} ${indexes.join(" | ")}`);
  }
  const button = page.getByRole("button", { name: /抽查弱词/ });
  if (!(await button.count())) throw new Error("learned review entry is missing");
  await button.first().click();
  await page.waitForSelector(".study-overlay .word-card");
  const initialTotal = Number((await page.locator(".study-count").innerText()).match(/(\d+)\s*$/)[1]);
  if (initialTotal <= 40) throw new Error(`expected an unlimited queue above 40, got ${initialTotal}`);
  await page.getByRole("button", { name: "显示释义" }).click();
  await page.getByRole("button", { name: /忘了 1/ }).click();
  await page.waitForTimeout(200);
  const afterAgainTotal = Number((await page.locator(".study-count").innerText()).match(/(\d+)\s*$/)[1]);
  if (afterAgainTotal !== initialTotal + 1) {
    throw new Error(`wrong learned word was not requeued: ${initialTotal} -> ${afterAgainTotal}`);
  }
}' >/dev/null

echo "{\"ok\":true,\"ui\":\"learned review entry starts a session\"}"
