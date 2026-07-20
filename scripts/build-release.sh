#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

bash "$DIR/scripts/load-google-oauth.sh"

VERSION=$(node -p "require('./package.json').version")
export CSC_IDENTITY_AUTO_DISCOVERY=false

echo "=== Memos v${VERSION} 릴리스 빌드 ==="

echo "→ Mac (Universal)..."
npx electron-builder --mac dir --universal --publish never

APP="$DIR/dist/mac-universal/Memos.app"
OUT_ZIP="$DIR/dist/Memos.zip"
rm -f "$OUT_ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT_ZIP"
echo "   $OUT_ZIP"

echo "→ Windows..."
npx electron-builder --win nsis --x64 --publish never
echo "   dist/Memos Setup ${VERSION}.exe"

echo ""
echo "완료! Releases에 올릴 파일:"
echo "  dist/Memos.zip"
echo "  dist/Memos Setup ${VERSION}.exe"
echo "  Memos-Mac-Open.command"
echo "  MAC-INSTALL.txt"
