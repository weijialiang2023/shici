#!/bin/zsh
# 把当前工作目录的站点同步到长期服务读取的位置。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$HOME/Library/Application Support/Shici"
mkdir -p "$TARGET"
# The live server stores progress/ inside TARGET. Never let a static-site sync
# delete that directory.
rsync -a --delete \
  --exclude '.DS_Store' \
  --exclude '.git/' \
  --exclude 'progress/' \
  --exclude 'tools/source/' \
  "$ROOT/" "$TARGET/"
mkdir -p "$TARGET/progress/history/daily" "$TARGET/progress/history/checkpoints"
echo "已同步到: $TARGET"
echo "访问: http://127.0.0.1:4173/"
