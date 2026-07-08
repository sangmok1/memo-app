#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# shellcheck source=load-signing-env.sh
source "$DIR/scripts/load-signing-env.sh"

VERSION=$(node -p "require('./package.json').version")
unset CSC_IDENTITY_AUTO_DISCOVERY
# 서명만 — APPLE_* 가 있으면 electron-builder가 공증까지 시도함
unset APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID

echo "=== Memos v${VERSION} 서명 릴리스 (공증 없음) ==="

echo "→ Mac (Universal, signed)..."
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
echo "✅ 서명 빌드 완료 (공증 없음). Releases에 올릴 파일:"
echo "  dist/Memos.zip"
echo "  dist/Memos Setup ${VERSION}.exe"
