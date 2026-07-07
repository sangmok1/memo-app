#!/bin/bash
# GitHub에서 받은 Memos.app 설치 후 "손상됨" 오류 해결용
set -e

APP_PATH="${1:-/Applications/Memos.app}"

if [ ! -d "$APP_PATH" ]; then
  echo "Memos.app을 찾을 수 없습니다."
  echo "사용법: bash install-from-download.sh /Applications/Memos.app"
  exit 1
fi

xattr -cr "$APP_PATH"
echo "완료! 이제 Memos를 실행할 수 있습니다."
open "$APP_PATH"
