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
rm -rf "$DIR/dist/mac-universal"
npx electron-builder --mac dir --universal --publish never -c electron-builder.signed.json

APP="$(bash "$DIR/scripts/resolve-mac-app.sh" "$DIR/dist/mac-universal" "$VERSION")"
OUT_ZIP="$DIR/dist/Memos.zip"

ASAR_VER=$(node -e "
  const {execSync}=require('child_process'); const os=require('os');
  const tmp=os.tmpdir()+'/memos-verify-'+process.pid;
  execSync('npx --yes asar extract '+JSON.stringify(process.argv[1])+' '+JSON.stringify(tmp), {stdio:'ignore'});
  console.log(require(tmp+'/package.json').version);
" "$APP/Contents/Resources/app.asar")
if [ "$ASAR_VER" != "$VERSION" ]; then
  echo "❌ 빌드 버전 불일치: app=$ASAR_VER, package.json=$VERSION"
  exit 1
fi
echo "   ✓ 빌드 확인: $APP (v$ASAR_VER)"

if ! spctl -a -t exec -vv "$APP" 2>&1 | grep -q "source=Notarized Developer ID"; then
  echo "⚠️  electron-builder 공증 미완료 — notarytool로 재시도..."
  TMPZIP="$(mktemp /tmp/Memos-notarize.XXXXXX.zip)"
  ditto -c -k --keepParent "$APP" "$TMPZIP"
  xcrun notarytool submit "$TMPZIP" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
  rm -f "$TMPZIP"
  xcrun stapler staple -v "$APP"
fi

if ! spctl -a -t exec -vv "$APP" 2>&1 | grep -q "source=Notarized Developer ID"; then
  echo "❌ 공증 검증 실패. Gatekeeper에서 차단됩니다."
  exit 1
fi
echo "   ✓ Apple 공증 확인됨 (Notarized Developer ID)"

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
