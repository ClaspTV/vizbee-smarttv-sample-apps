#!/usr/bin/env bash
# Sync per-platform Vite builds to s3://<bucket>/<prefix>/<platform>/, then
# (optionally) invalidate the matching CloudFront paths so edges pick up the
# new files.
#
# Usage:
#   bash scripts/deploy-s3.sh                       # all platforms with a built dist/
#   bash scripts/deploy-s3.sh tizen webos           # subset
#   VIZBEE_DEPLOY_PREFIX=staging bash scripts/deploy-s3.sh tizen   # → s3://<bucket>/staging/tizen/
#
# Env overrides:
#   VIZBEE_DEPLOY_BUCKET         (default: vzb-origin-qa)
#   VIZBEE_DEPLOY_PREFIX         (default: none — a sub-folder under the bucket, e.g. "staging" or "feature-x")
#   AWS_REGION                   (default: us-east-1)
#   AWS_PROFILE                  (whichever your CLI is configured with)
#   CLOUDFRONT_DISTRIBUTION_ID   (if set, invalidate /<prefix>/<platform>/* paths after sync)
set -euo pipefail

BUCKET="${VIZBEE_DEPLOY_BUCKET:-vzb-origin-qa}"
REGION="${AWS_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_ROOT="$ROOT/dist"

# Optional sub-folder prefix. Normalize away any leading/trailing slashes, then
# KEYBASE is "" (root) or "<prefix>/" so it slots cleanly into S3 keys + CF paths.
PREFIX="${VIZBEE_DEPLOY_PREFIX:-}"
PREFIX="${PREFIX#/}"
PREFIX="${PREFIX%/}"
KEYBASE=""
[ -n "$PREFIX" ] && KEYBASE="$PREFIX/"

ALL_PLATFORMS=(desktop viziosmartcast tizen webos xbox)
if [ "$#" -gt 0 ]; then
  PLATFORMS=("$@")
else
  PLATFORMS=("${ALL_PLATFORMS[@]}")
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found. Install AWS CLI v2." >&2
  exit 1
fi

if ! aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1; then
  echo "Bucket s3://$BUCKET not reachable in $REGION (missing, wrong region, or no permission)." >&2
  echo "Create it with:" >&2
  echo "  aws s3api create-bucket --bucket $BUCKET --region $REGION" >&2
  exit 1
fi

DEPLOYED=()
for p in "${PLATFORMS[@]}"; do
  src="$DIST_ROOT/$p"
  if [ ! -d "$src" ]; then
    echo "warn: no $src — skipping (run 'npm run build:$p' first)" >&2
    continue
  fi
  echo "→ syncing $src → s3://$BUCKET/${KEYBASE}$p/"

  # Vite emits content-hashed filenames under assets/; safe to cache forever.
  if [ -d "$src/assets" ]; then
    aws s3 sync "$src/assets/" "s3://$BUCKET/${KEYBASE}$p/assets/" \
      --region "$REGION" \
      --delete \
      --cache-control "public, max-age=31536000, immutable"
  fi

  # index.html and any non-hashed top-level files must be revalidated each load.
  aws s3 sync "$src/" "s3://$BUCKET/${KEYBASE}$p/" \
    --region "$REGION" \
    --delete \
    --exclude "assets/*" \
    --cache-control "no-cache, must-revalidate"

  DEPLOYED+=("$p")
done

# CloudFront invalidation — scoped to the platforms we actually deployed so we
# don't burn through the free-tier (1000 paths/month) on empty wildcards.
if [ "${#DEPLOYED[@]}" -gt 0 ] && [ -n "${CLOUDFRONT_DISTRIBUTION_ID:-}" ]; then
  PATHS=()
  for p in "${DEPLOYED[@]}"; do PATHS+=("/${KEYBASE}$p/*"); done
  echo "→ invalidating ${PATHS[*]} on $CLOUDFRONT_DISTRIBUTION_ID"
  INV_ID="$(aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "${PATHS[@]}" \
    --query 'Invalidation.Id' --output text)"
  echo "  invalidation $INV_ID submitted; polling for completion (1-3 min typical)"

  START=$SECONDS
  while true; do
    STATUS="$(aws cloudfront get-invalidation \
      --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
      --id "$INV_ID" --query 'Invalidation.Status' --output text 2>/dev/null || echo Unknown)"
    case "$STATUS" in
      Completed)
        echo " ✓ invalidation completed in $((SECONDS - START))s"
        break
        ;;
      InProgress)
        printf "."
        sleep 5
        # Hard cap so a stuck invalidation doesn't block the deploy script.
        if [ $((SECONDS - START)) -gt 600 ]; then
          echo " ✗ still InProgress after 10 min — check manually:"
          echo "    aws cloudfront get-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --id $INV_ID"
          break
        fi
        ;;
      *)
        echo " ✗ unexpected invalidation status: $STATUS" >&2
        break
        ;;
    esac
  done
elif [ "${#DEPLOYED[@]}" -gt 0 ]; then
  echo "(skipping CloudFront invalidation — set CLOUDFRONT_DISTRIBUTION_ID to enable)"
fi

echo "done."
