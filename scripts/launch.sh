#!/bin/bash
# 터미널 없이 Memo 앱 실행 (더블클릭해도 됨)
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="$(find "$DIR/dist" -name "Memo.app" -maxdepth 3 2>/dev/null | head -1)"

if [ -n "$APP" ]; then
  open "$APP"
  exit 0
fi

# 빌드 전: Electron을 백그라운드로 실행 (터미널 닫아도 유지)
cd "$DIR"
nohup ./node_modules/.bin/electron . >> /tmp/memo-postit.log 2>&1 &
disown
echo "백그라운드 실행됨. 로그: /tmp/memo-postit.log"
echo "터미널 없이 쓰려면: npm run build && npm run launch"
