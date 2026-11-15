#!/bin/zsh
# 拾词 · 本地启动器
# 正常情况下 LaunchAgent 已经在运行；这里只是备用恢复入口。
URL="http://127.0.0.1:4173/"
if ! curl -s --max-time 2 -I "$URL" >/dev/null 2>&1; then
  TARGET="$HOME/Library/Application Support/Shici"
  if [ ! -d "$TARGET" ]; then
    TARGET="$(cd "$(dirname "$0")" && pwd)"
  fi
  if [ -f "$TARGET/serve.py" ]; then
    nohup /usr/bin/python3 "$TARGET/serve.py" >/tmp/shici-web.log 2>&1 &
  else
    (cd "$TARGET" && nohup /usr/bin/python3 -m http.server 4173 --bind 127.0.0.1 >/tmp/shici-web.log 2>&1 &)
  fi
  sleep 1
fi
open "$URL"
