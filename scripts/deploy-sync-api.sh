#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

PROJECT="${GCP_PROJECT:-api-creator-461905}"
REGION="${GCP_REGION:-asia-northeast3}"
BUCKET="${GCS_BUCKET:-memos-sync-api-creator-461905}"
SERVICE_NAME="${SYNC_SERVICE_NAME:-memos-sync}"

echo "=== Memos Sync API 배포 (Cloud Run) ==="
echo "Project: $PROJECT"
echo "Region:  $REGION"
echo "Bucket:  $BUCKET"

gcloud config set project "$PROJECT"

gcloud services enable storage.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com --quiet

if ! gsutil ls -b "gs://${BUCKET}" >/dev/null 2>&1; then
  echo "→ 버킷 생성: gs://${BUCKET}"
  gsutil mb -p "$PROJECT" -l "$REGION" "gs://${BUCKET}"
fi

gsutil uniformbucketlevelaccess set on "gs://${BUCKET}" 2>/dev/null || true

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gsutil iam ch "serviceAccount:${RUN_SA}:objectAdmin" "gs://${BUCKET}" 2>/dev/null || true

cd "$DIR/sync-api"
npm install --omit=dev

echo "→ Cloud Run 배포..."
gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT" \
  --region="$REGION" \
  --source=. \
  --allow-unauthenticated \
  --set-env-vars "GCS_BUCKET=${BUCKET}" \
  --memory=256Mi \
  --timeout=60 \
  --quiet

URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')

cat > "$DIR/sync-api.config.json" <<EOF
{
  "apiUrl": "${URL}",
  "bucket": "${BUCKET}",
  "region": "${REGION}",
  "project": "${PROJECT}"
}
EOF

echo ""
echo "✅ 배포 완료"
echo "   API URL: $URL"
echo "   Config:  sync-api.config.json"
