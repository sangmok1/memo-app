#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(node -p "require('$DIR/package.json').version")
APP=""
if [ -d "$DIR/dist/mac-universal" ]; then
  APP="$(bash "$DIR/scripts/resolve-mac-app.sh" "$DIR/dist/mac-universal" "$VERSION" 2>/dev/null || true)"
fi
if [ -z "$APP" ]; then
  for candidate in \
    "$DIR/dist/mac-universal/Memos.app" \
    "$DIR/dist/mac-arm64/Memos.app" \
    "$DIR/dist/mac/Memos.app"; do
    if [ -d "$candidate" ]; then
      APP="$candidate"
      break
    fi
  done
fi
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
