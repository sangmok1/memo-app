#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# shellcheck source=load-signing-env.sh
source "$DIR/scripts/load-signing-env.sh"

VERSION=$(node -p "require('./package.json').version")
unset CSC_IDENTITY_AUTO_DISCOVERY

echo "=== Memos v${VERSION} 서명 + 공증 릴리스 빌드 ==="

echo "→ Mac (Universal, signed + notarized)..."
npx electron-builder --mac dir --universal --publish never -c electron-builder.signed.json

APP="$DIR/dist/mac-universal/Memos.app"
OUT_ZIP="$DIR/dist/Memos.zip"
rm -f "$OUT_ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT_ZIP"
echo "   $OUT_ZIP"

echo "→ Windows..."
npx electron-builder --win nsis --x64 --publish never
echo "   dist/Memos Setup ${VERSION}.exe"

echo ""
echo "✅ 서명·공증 완료! Releases에 올릴 파일:"
echo "  dist/Memos.zip"
echo "  dist/Memos Setup ${VERSION}.exe"
echo "  Memos-Mac-Open.command (서명 빌드는 xattr 없이도 실행 가능)"
echo "  MAC-INSTALL.txt"
