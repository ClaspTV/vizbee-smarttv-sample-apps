#!/usr/bin/env bash
# One-time AWS setup: private S3 bucket + CloudFront distribution with OAC.
# Idempotent enough to re-run: skips create steps when the resource already exists.
#
# Outputs the values you need for deploys:
#   - bucket name
#   - distribution ID (export as CLOUDFRONT_DISTRIBUTION_ID for deploy-s3.sh)
#   - distribution domain (the *.cloudfront.net URL)
set -euo pipefail

BUCKET="${VIZBEE_DEPLOY_BUCKET:-vzb-origin-qa}"
REGION="${AWS_REGION:-us-east-1}"
PRICE_CLASS="${CF_PRICE_CLASS:-PriceClass_100}"  # US/Canada/Europe edges only

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found. Install AWS CLI v2." >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "AWS account: $ACCOUNT_ID"
echo "Region:      $REGION"
echo "Bucket:      $BUCKET"
echo

# ---- 1. Bucket -------------------------------------------------------------
if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null 2>&1; then
  echo "[1/5] bucket exists — skipping create"
else
  echo "[1/5] creating bucket $BUCKET in $REGION"
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
  fi
fi

echo "[2/5] locking public access on $BUCKET"
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  >/dev/null

# ---- 2. OAC ---------------------------------------------------------------
OAC_NAME="${BUCKET}-oac"
OAC_ID="$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='${OAC_NAME}'].Id | [0]" \
  --output text 2>/dev/null || true)"

if [ -z "$OAC_ID" ] || [ "$OAC_ID" = "None" ]; then
  echo "[3/5] creating OAC $OAC_NAME"
  OAC_ID="$(aws cloudfront create-origin-access-control \
    --origin-access-control-config "Name=${OAC_NAME},OriginAccessControlOriginType=s3,SigningBehavior=always,SigningProtocol=sigv4" \
    --query 'OriginAccessControl.Id' --output text)"
else
  echo "[3/5] OAC exists — id $OAC_ID"
fi

# ---- 3. CloudFront distribution -------------------------------------------
# Match distributions by S3 origin DomainName rather than Comment — comments
# get edited by humans, origins are the load-bearing identifier.
ORIGIN_DOMAIN="${BUCKET}.s3.${REGION}.amazonaws.com"
EXISTING_DIST_ID="$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Origins.Items[?DomainName=='${ORIGIN_DOMAIN}']].Id | [0]" \
  --output text 2>/dev/null || true)"

if [ -n "$EXISTING_DIST_ID" ] && [ "$EXISTING_DIST_ID" != "None" ]; then
  DIST_ID="$EXISTING_DIST_ID"
  echo "[4/5] distribution exists — id $DIST_ID"
else
  CALLER_REF="${BUCKET}-$(date +%s)"
  CONFIG_FILE="$(mktemp -t cf-config.XXXXXX.json)"
  cat >"$CONFIG_FILE" <<EOF
{
  "CallerReference": "${CALLER_REF}",
  "Comment": "${BUCKET} CDN",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "S3-${BUCKET}",
      "DomainName": "${BUCKET}.s3.${REGION}.amazonaws.com",
      "OriginAccessControlId": "${OAC_ID}",
      "S3OriginConfig": {"OriginAccessIdentity": ""},
      "CustomHeaders": {"Quantity": 0},
      "ConnectionAttempts": 3,
      "ConnectionTimeout": 10,
      "OriginShield": {"Enabled": false}
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-${BUCKET}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}
    },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6"
  },
  "PriceClass": "${PRICE_CLASS}",
  "HttpVersion": "http2",
  "IsIPV6Enabled": true
}
EOF
  echo "[4/5] creating distribution (this can take ~30s to register)"
  DIST_ID="$(aws cloudfront create-distribution \
    --distribution-config "file://${CONFIG_FILE}" \
    --query 'Distribution.Id' --output text)"
  rm -f "$CONFIG_FILE"
fi

DIST_ARN="arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}"
DIST_DOMAIN="$(aws cloudfront get-distribution --id "$DIST_ID" \
  --query 'Distribution.DomainName' --output text)"

# ---- 4. Bucket policy -----------------------------------------------------
echo "[5/5] applying bucket policy granting CloudFront ($DIST_ID) read"
POLICY_FILE="$(mktemp -t bucket-policy.XXXXXX.json)"
cat >"$POLICY_FILE" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontServicePrincipalReadOnly",
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET}/*",
    "Condition": {
      "StringEquals": {"AWS:SourceArn": "${DIST_ARN}"}
    }
  }]
}
EOF
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "file://${POLICY_FILE}" >/dev/null
rm -f "$POLICY_FILE"

# ---- 5. CloudFront Function: rewrite /foo and /foo/ to /foo/index.html ----
# CloudFront + S3 (REST endpoint) doesn't auto-resolve directory URIs, so
# /tizen and /tizen/ would 403. A viewer-request function fixes that without
# making the bucket public.
FUNC_NAME="${BUCKET}-index-rewrite"
if ! command -v jq >/dev/null 2>&1; then
  echo "warn: jq not installed — skipping CloudFront function setup" >&2
else
  if aws cloudfront describe-function --name "$FUNC_NAME" --stage DEVELOPMENT >/dev/null 2>&1; then
    echo "[6/7] CloudFront function $FUNC_NAME exists — skipping create"
  else
    echo "[6/7] creating CloudFront function $FUNC_NAME"
    FUNC_CODE="$(mktemp -t cf-fn.XXXXXX.js)"
    cat >"$FUNC_CODE" <<'JS'
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.split('/').pop().indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}
JS
    aws cloudfront create-function \
      --name "$FUNC_NAME" \
      --function-config "Comment=Rewrite directory URIs to /index.html,Runtime=cloudfront-js-2.0" \
      --function-code "fileb://$FUNC_CODE" >/dev/null
    rm -f "$FUNC_CODE"
  fi

  # Promote DEVELOPMENT → LIVE. publish-function is a no-op if LIVE already
  # matches DEVELOPMENT, so this is safe to re-run.
  DEV_ETAG="$(aws cloudfront describe-function --name "$FUNC_NAME" --stage DEVELOPMENT \
    --query 'ETag' --output text 2>/dev/null || true)"
  if [ -n "$DEV_ETAG" ] && [ "$DEV_ETAG" != "None" ]; then
    aws cloudfront publish-function --name "$FUNC_NAME" --if-match "$DEV_ETAG" >/dev/null 2>&1 || true
  fi
  FUNC_ARN="$(aws cloudfront describe-function --name "$FUNC_NAME" --stage LIVE \
    --query 'FunctionSummary.FunctionMetadata.FunctionARN' --output text)"

  echo "[7/7] ensuring function associated with distribution default behavior"
  DIST_CFG_FILE="$(mktemp -t dist-cfg.XXXXXX.json)"
  aws cloudfront get-distribution-config --id "$DIST_ID" > "$DIST_CFG_FILE"
  DIST_ETAG="$(jq -r '.ETag' "$DIST_CFG_FILE")"
  ALREADY="$(jq -r --arg arn "$FUNC_ARN" '
    (.DistributionConfig.DefaultCacheBehavior.FunctionAssociations.Items // [])
    | map(select(.FunctionARN == $arn)) | length' "$DIST_CFG_FILE")"
  if [ "$ALREADY" -gt 0 ]; then
    echo "       already associated"
  else
    UPDATED="$(mktemp -t dist-cfg-updated.XXXXXX.json)"
    jq --arg arn "$FUNC_ARN" '
      .DistributionConfig.DefaultCacheBehavior.FunctionAssociations = {
        Quantity: 1,
        Items: [{FunctionARN: $arn, EventType: "viewer-request"}]
      } | .DistributionConfig' "$DIST_CFG_FILE" > "$UPDATED"
    aws cloudfront update-distribution \
      --id "$DIST_ID" \
      --if-match "$DIST_ETAG" \
      --distribution-config "file://$UPDATED" >/dev/null
    rm -f "$UPDATED"
    echo "       associated; allow a few minutes to propagate"
  fi
  rm -f "$DIST_CFG_FILE"
fi

echo
echo "Done."
echo "  Bucket:                 s3://${BUCKET}"
echo "  CloudFront distribution: ${DIST_ID}"
echo "  CloudFront domain:       https://${DIST_DOMAIN}"
echo
echo "Add this to your shell to enable invalidation on deploy:"
echo "  export CLOUDFRONT_DISTRIBUTION_ID=${DIST_ID}"
