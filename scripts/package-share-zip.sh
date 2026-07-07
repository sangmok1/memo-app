#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

VERSION=$(node -p "require('./package.json').version")

echo "→ Memos.app 빌드 중..."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --universal --publish never

APP="$DIR/dist/mac-universal/Memos.app"
if [ ! -d "$APP" ]; then
  APP="$(find "$DIR/dist" -name "Memos.app" -path "*/mac-*/*" 2>/dev/null | head -1)"
fi

if [ ! -d "$APP" ]; then
  echo "Memos.app을 찾을 수 없습니다."
  exit 1
fi

OUT="$DIR/dist/Memos.zip"
rm -f "$OUT"

echo "→ Memos.zip 생성 중..."
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT"

echo ""
echo "완료! 파일 전달용 zip:"
echo "  $OUT"
echo "  ($(du -h "$OUT" | cut -f1))"
echo ""
echo "받는 사람: zip 풀기 → Memos.app을 Applications로 이동"
echo "실행 안 되면: xattr -cr /Applications/Memos.app"
