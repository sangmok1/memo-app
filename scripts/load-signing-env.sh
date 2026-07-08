#!/bin/bash
# shellcheck disable=SC1091

ENV_FILE="${SIGNING_ENV_FILE:-$(cd "$(dirname "$0")/.." && pwd)/.env.signing}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env.signing 파일이 없습니다."
  echo "   cp .env.signing.example .env.signing 후 Apple ID / 앱 전용 암호 / Team ID를 입력하세요."
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

missing=()
[ -z "$APPLE_ID" ] && missing+=("APPLE_ID")
[ -z "$APPLE_APP_SPECIFIC_PASSWORD" ] && missing+=("APPLE_APP_SPECIFIC_PASSWORD")
[ -z "$APPLE_TEAM_ID" ] && missing+=("APPLE_TEAM_ID")

if [ "${#missing[@]}" -gt 0 ]; then
  echo "❌ .env.signing 에 다음 값이 필요합니다: ${missing[*]}"
  exit 1
fi

if ! security find-identity -v -p codesigning 2>/dev/null | grep -q 'Developer ID Application'; then
  echo "❌ 키체인에 Developer ID Application 인증서가 없습니다."
  echo "   security find-identity -v -p codesigning 으로 확인하세요."
  exit 1
fi

echo "→ 서명 설정 로드됨 (Team ID: $APPLE_TEAM_ID)"
