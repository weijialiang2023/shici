#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SHICI_TEST_PORT:-4183}"
SESSION="shici-exit-test"
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
  await page.getByRole("button", { name: "开始今日学习" }).click();
  await page.getByRole("button", { name: "退出本轮学习" }).click();
  await page.getByRole("button", { name: "保存并退出" }).click();
  if (await page.locator(".study-overlay").count()) {
    throw new Error("session overlay remained after save and exit");
  }
  await page.getByRole("button", { name: "开始今日学习" }).click();
  await page.evaluate(() => {
    sessionStorage.removeItem("shici-test-beforeunload");
    window.addEventListener("beforeunload", event => {
      sessionStorage.setItem("shici-test-beforeunload", String(event.defaultPrevented));
    });
  });
  page.once("dialog", async dialog => dialog.accept());
  await page.reload();
}' >/dev/null

RESULT="$("${PWCLI[@]}" -s="$SESSION" eval '() => ({blocked: sessionStorage.getItem("shici-test-beforeunload") === "true", value: sessionStorage.getItem("shici-test-beforeunload")})' --raw)"

python3 - "$RESULT" <<'PY'
import json
import sys

result = json.loads(sys.argv[1])
assert result["blocked"] is False, f"active learning session must not block Safari exit: {result}"
print(json.dumps({"ok": True, **result}))
PY
