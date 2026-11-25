#!/usr/bin/env bash
# Deploys PokéReader as one AWS Lambda function behind a public Function URL (HTTPS).
#
#   scripts/deploy-lambda.sh            build, then create or update the function
#   scripts/deploy-lambda.sh destroy    remove the function, its URL, role and logs
#
# Needs the AWS CLI with credentials, and DEEPSEEK_API_KEY in .env (or the environment).
# Optional: FUNCTION_NAME (default pokereader), AWS_REGION (default: CLI default),
# LAMBDA_ORIGIN_SECRET (.env or environment): if set, the function refuses any request
# without that value in the x-origin-secret header (see README, "Private access").
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="${FUNCTION_NAME:-pokereader}"
ROLE="${NAME}-lambda-role"
REGION="${AWS_REGION:-$(aws configure get region)}"
export AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""

if [[ "${1:-}" == "destroy" ]]; then
  aws lambda delete-function-url-config --function-name "$NAME" 2>/dev/null || true
  aws lambda delete-function --function-name "$NAME" 2>/dev/null || true
  aws iam detach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true
  aws iam delete-role --role-name "$ROLE" 2>/dev/null || true
  aws logs delete-log-group --log-group-name "/aws/lambda/$NAME" 2>/dev/null || true
  echo "Removed $NAME."
  exit 0
fi

if [[ -z "${DEEPSEEK_API_KEY:-}" && -f .env ]]; then
  DEEPSEEK_API_KEY="$(grep -E '^DEEPSEEK_API_KEY=' .env | head -1 | cut -d= -f2-)"
fi
[[ -n "${DEEPSEEK_API_KEY:-}" ]] || { echo "DEEPSEEK_API_KEY is not set (.env or environment)." >&2; exit 1; }

if [[ -z "${LAMBDA_ORIGIN_SECRET:-}" && -f .env ]]; then
  LAMBDA_ORIGIN_SECRET="$(grep -E '^LAMBDA_ORIGIN_SECRET=' .env | head -1 | cut -d= -f2- || true)"
fi

echo "Building…"
npm run build >/dev/null
STAGE=.lambda
rm -rf "$STAGE" && mkdir -p "$STAGE/dist/server"
cp package.json package-lock.json "$STAGE/"
cp -R dist/client "$STAGE/dist/client"
npx esbuild src/server/lambda.ts --bundle --platform=node --format=esm --packages=external \
  --target=node22 --outfile="$STAGE/dist/server/lambda.js" --log-level=warning
# Production dependencies only, with the Linux ARM build of sharp that Lambda needs.
(cd "$STAGE" && npm ci --omit=dev --os=linux --cpu=arm64 --libc=glibc --silent)
(cd "$STAGE" && rm -f ../.lambda.zip && zip -qr ../.lambda.zip .)
echo "Package: $(du -h .lambda.zip | cut -f1)"

if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  echo "Creating role…"
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sleep 10 # give IAM a moment before Lambda tries to use the role
fi
ROLE_ARN="$(aws iam get-role --role-name "$ROLE" --query Role.Arn --output text)"

# Written to a private temp file so the key never appears in a command line or the terminal.
ENV_FILE="$(mktemp)"; trap 'rm -f "$ENV_FILE"' EXIT
printf '{"Variables":{"NODE_ENV":"production","TRUST_PROXY":"true","DEEPSEEK_API_KEY":"%s","ORIGIN_SECRET":"%s"}}' \
  "$DEEPSEEK_API_KEY" "${LAMBDA_ORIGIN_SECRET:-}" > "$ENV_FILE"

if aws lambda get-function --function-name "$NAME" >/dev/null 2>&1; then
  echo "Updating function…"
  aws lambda update-function-code --function-name "$NAME" --zip-file fileb://.lambda.zip >/dev/null
  aws lambda wait function-updated --function-name "$NAME"
  aws lambda update-function-configuration --function-name "$NAME" --environment "file://$ENV_FILE" >/dev/null
else
  echo "Creating function…"
  aws lambda create-function --function-name "$NAME" --runtime nodejs22.x --architectures arm64 \
    --handler dist/server/lambda.handler --role "$ROLE_ARN" --zip-file fileb://.lambda.zip \
    --memory-size 1024 --timeout 60 --environment "file://$ENV_FILE" >/dev/null
  aws lambda wait function-active --function-name "$NAME"
  aws lambda create-function-url-config --function-name "$NAME" --auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$NAME" --statement-id public-url \
    --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$NAME" --statement-id public-url-invoke \
    --action lambda:InvokeFunction --principal '*' --invoked-via-function-url >/dev/null
fi
aws lambda wait function-updated --function-name "$NAME"

echo "Live at: $(aws lambda get-function-url-config --function-name "$NAME" --query FunctionUrl --output text)"
