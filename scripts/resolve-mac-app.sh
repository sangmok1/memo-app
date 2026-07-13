#!/bin/bash
# dist/mac-universal 안에서 방금 빌드된 .app 경로 반환 (stale Memos.app 회피)
set -e

DIR="${1:?usage: resolve-mac-app.sh <mac-universal-dir>}"
EXPECTED_VERSION="${2:-}"

apps=()
while IFS= read -r app; do
  [ -n "$app" ] && apps+=("$app")
done < <(find "$DIR" -maxdepth 1 -name "*.app" -type d 2>/dev/null | sort)

if [ "${#apps[@]}" -eq 0 ]; then
  echo "❌ $DIR 에 .app이 없습니다." >&2
  exit 1
fi

if [ "${#apps[@]}" -eq 1 ]; then
  echo "${apps[0]}"
  exit 0
fi

# 여러 개면 package.json 버전이 맞고, 수정 시각이 가장 최근인 것 선택
best=""
best_mtime=0
for app in "${apps[@]}"; do
  asar="$app/Contents/Resources/app.asar"
  [ -f "$asar" ] || continue
  ver=$(node -e "
    const fs=require('fs'); const {execSync}=require('child_process');
    const tmp=require('os').tmpdir()+'/memos-asar-'+process.pid;
    execSync('npx --yes asar extract '+JSON.stringify(process.argv[1])+' '+JSON.stringify(tmp), {stdio:'ignore'});
    console.log(require(tmp+'/package.json').version);
  " "$asar" 2>/dev/null || echo "")
  mtime=$(stat -f %m "$app" 2>/dev/null || stat -c %Y "$app" 2>/dev/null || echo 0)
  if [ -n "$EXPECTED_VERSION" ] && [ "$ver" = "$EXPECTED_VERSION" ] && [ "$mtime" -ge "$best_mtime" ]; then
    best="$app"
    best_mtime=$mtime
  elif [ -z "$best" ] || [ "$mtime" -gt "$best_mtime" ]; then
    best="$app"
    best_mtime=$mtime
  fi
done

if [ -z "$best" ]; then
  echo "❌ 사용 가능한 .app을 찾지 못했습니다." >&2
  exit 1
fi

echo "$best"
