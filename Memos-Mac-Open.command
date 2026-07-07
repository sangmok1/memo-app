#!/bin/bash
# Memos.app 보안 차단 해제 후 실행 (더블클릭)
cd "$(dirname "$0")"

APP=""
for CAND in "/Applications/Memos.app" "$HOME/Applications/Memos.app" "$(dirname "$0")/Memos.app"; do
  if [ -d "$CAND" ]; then
    APP="$CAND"
    break
  fi
done

if [ -z "$APP" ]; then
  osascript -e 'display dialog "Memos.app을 찾을 수 없습니다.\n\nApplications 폴더에 Memos.app을 넣은 뒤\n다시 실행해 주세요." buttons {"확인"} default button 1 with title "Memos"'
  exit 1
fi

xattr -cr "$APP"
open "$APP"
