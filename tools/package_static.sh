#!/bin/bash
# Build an upload-ready static package without local records or development files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date '+%Y%m%d-%H%M%S')"
OUTPUT="${1:-$ROOT/dist/shici-static-$STAMP.zip}"

if [[ -e "$OUTPUT" ]]; then
  echo "输出文件已存在，拒绝覆盖: $OUTPUT" >&2
  exit 1
fi
mkdir -p "$(dirname "$OUTPUT")"

cd "$ROOT"
zip -q -r "$OUTPUT" \
  index.html \
  offline.html \
  feedback.html \
  privacy.html \
  terms.html \
  manifest.webmanifest \
  sw.js \
  css \
  js \
  assets \
  data \
  -x '*.DS_Store' '__pycache__/*' '*.pyc'

if unzip -l "$OUTPUT" | grep -Eq '(^|/)progress/|(^|/)tools/source/|(^|/)\.git/'; then
  echo "静态包意外包含本地记录或开发私有文件" >&2
  exit 1
fi

echo "静态包: $OUTPUT"
echo "大小: $(du -h "$OUTPUT" | awk '{print $1}')"
