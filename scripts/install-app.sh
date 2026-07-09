#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP=""
for candidate in \
  "$DIR/dist/mac-universal/Memos.app" \
  "$DIR/dist/mac-arm64/Memos.app" \
  "$DIR/dist/mac/Memos.app"; do
  if [ -d "$candidate" ]; then
    APP="$candidate"
    break
  fi
done
if [ -z "$APP" ]; then
  APP="$(find "$DIR/dist" -name "Memos.app" -maxdepth 3 2>/dev/null | head -1)"
fi

if [ -z "$APP" ]; then
  echo "Memos.app not found. Run: npm run build"
  exit 1
fi

rm -rf /Applications/Memo.app /Applications/포잇.app /Applications/Memos.app 2>/dev/null
ditto "$APP" "/Applications/Memos.app"
echo "Installed: /Applications/Memos.app"
open "/Applications/Memos.app"
