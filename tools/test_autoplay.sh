#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SHICI_TEST_PORT:-4182}"
SESSION="shici-autoplay-test-$$"
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

"${PWCLI[@]}" -s="$SESSION" open "http://127.0.0.1:$PORT/#books" "${CONFIG_ARGS[@]}" >/dev/null
"${PWCLI[@]}" -s="$SESSION" run-code 'async (page) => {
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "文言精讲 120", exact: true }) }).getByRole("button").click();
  await page.waitForURL(/#home$/);
  await page.evaluate(() => {
    window.__spokenTexts = [];
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() {},
        getVoices() { return []; },
        speak(utterance) { window.__spokenTexts.push(utterance.text); }
      }
    });
    window.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = String(text); }
    };
  });
  await page.getByRole("button", { name: "开始今日学习" }).click();
  await page.waitForTimeout(500);
}' >/dev/null

FIRST="$("${PWCLI[@]}" -s="$SESSION" eval '() => ({word: document.querySelector(".word-card__hero h1")?.textContent || "", spoken: window.__spokenTexts})' --raw)"

"${PWCLI[@]}" -s="$SESSION" run-code 'async (page) => {
  await page.getByRole("button", { name: "显示释义" }).click();
}' >/dev/null
REVEALED="$("${PWCLI[@]}" -s="$SESSION" eval '() => ({word: document.querySelector(".word-card__hero h1")?.textContent || "", spoken: window.__spokenTexts})' --raw)"

"${PWCLI[@]}" -s="$SESSION" run-code 'async (page) => {
  await page.getByRole("button", { name: /认识 3/ }).click();
  await page.waitForTimeout(500);
}' >/dev/null
SECOND="$("${PWCLI[@]}" -s="$SESSION" eval '() => ({word: document.querySelector(".word-card__hero h1")?.textContent || "", spoken: window.__spokenTexts})' --raw)"

python3 - "$FIRST" "$REVEALED" "$SECOND" <<'PY'
import json
import sys

first, revealed, second = [json.loads(value) for value in sys.argv[1:]]

assert first["word"], f"failed to enter a word card: {first}"
assert first["spoken"] == [first["word"]], f"first card must speak only its word once: {first}"
assert revealed["spoken"] == [revealed["word"]], f"revealing must not replay speech: {revealed}"
assert len(second["spoken"]) == 2, f"second card must add exactly one reading: {second}"
assert second["spoken"][-1] == second["word"], f"second card must speak only its word: {second}"
print(json.dumps({"ok": True, "first": first, "second": second}, ensure_ascii=False))
PY
