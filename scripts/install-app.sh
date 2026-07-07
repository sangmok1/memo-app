#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="$(find "$DIR/dist" -name "*.app" -maxdepth 3 2>/dev/null | head -1)"

if [ -z "$APP" ]; then
  echo "Memos.app not found. Run: npm run build"
  exit 1
fi

rm -rf /Applications/Memo.app /Applications/포잇.app /Applications/Memos.app 2>/dev/null
cp -R "$APP" "/Applications/Memos.app"
echo "Installed: /Applications/Memos.app"
open "/Applications/Memos.app"
