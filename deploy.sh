#!/usr/bin/env bash
# Deploy the frontend to Cloud Run via Cloud Build.
# Usage: ./deploy.sh [PROJECT_ID]
set -euo pipefail

PROJECT_ID="${1:-${GCP_PROJECT_ID:-striking-ruler-506214-f6}}"
REGION="${GCP_REGION:-asia-southeast1}"

# Ensure the Artifact Registry repo exists (idempotent).
gcloud artifacts repositories describe web-assembly \
  --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1 \
  || gcloud artifacts repositories create web-assembly \
       --repository-format=docker --project="$PROJECT_ID" --location="$REGION"

gcloud builds submit \
  --project="$PROJECT_ID" \
  --config=cloudbuild.yaml \
  .
