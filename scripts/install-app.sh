#!/bin/bash
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="$(find "$DIR/dist" -name "Memo.app" -maxdepth 3 2>/dev/null | head -1)"

if [ -z "$APP" ]; then
  echo "Memo.app이 없습니다. 먼저 npm run build 를 실행하세요."
  exit 1
fi

cp -R "$APP" /Applications/Memo.app
echo "설치 완료: /Applications/Memo.app"
open /Applications/Memo.app
