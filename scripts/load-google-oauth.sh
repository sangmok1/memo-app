#!/bin/bash
# 로컬 OAuth 설정 로드 (google-oauth.config.json 생성)

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$DIR/.env.google.oauth"
OUT="$DIR/google-oauth.config.json"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE 없음"
  echo "   cp .env.google.oauth.example .env.google.oauth 후 GOOGLE_CLIENT_SECRET 입력"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "$GOOGLE_CLIENT_ID" ]; then
  echo "❌ GOOGLE_CLIENT_ID가 비어 있습니다."
  exit 1
fi

node -e "
const fs = require('fs');
const cfg = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectPort: Number(process.env.GOOGLE_OAUTH_REDIRECT_PORT || 47829),
};
fs.writeFileSync('$OUT', JSON.stringify(cfg, null, 2) + '\n');
console.log('✅ google-oauth.config.json 생성 (port:', cfg.redirectPort + ', clientSecret:', cfg.clientSecret ? '있음' : '없음', ')');
"
