#!/bin/bash
# Launch Memos without terminal
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="$(find "$DIR/dist" -name "*.app" -maxdepth 3 2>/dev/null | head -1)"

if [ -n "$APP" ]; then
  open "$APP"
  exit 0
fi

cd "$DIR"
nohup ./node_modules/.bin/electron . >> /tmp/memos.log 2>&1 &
disown
echo "Running in background. Log: /tmp/memos.log"
echo "For app mode: npm run build && npm run launch"
