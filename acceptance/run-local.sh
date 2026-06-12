#!/bin/bash
set -e

# Runs all scenarios tagged @runme against the local environment.
# Tag a scenario with @runme in the feature file to include it in this run.

cd "$(dirname "$0")"

npm install --silent
npx playwright install chromium

export DEFRA_ID_USER_PASSWORD="${DEFRA_ID_USER_PASSWORD:-x}"
export GRANTS_UI_BACKEND_AUTH_TOKEN="${GRANTS_UI_BACKEND_AUTH_TOKEN:-auth_token}"
export GRANTS_UI_BACKEND_ENCRYPTION_KEY="${GRANTS_UI_BACKEND_ENCRYPTION_KEY:-encryption_key}"
export APPLICATION_LOCK_TOKEN_SECRET="${APPLICATION_LOCK_TOKEN_SECRET:-dev-lock-secret}"
export MOCKSERVER_HOST="${MOCKSERVER_HOST:-localhost}"
export MOCKSERVER_PORT="${MOCKSERVER_PORT:-1080}"
export BASE_URL="${BASE_URL:-http://localhost:3000}"
export BASE_BACKEND_URL="${BASE_BACKEND_URL:-http://localhost:3001}"

mkdir -p schemas
TAGS_JSON=$(curl -sf --ssl-no-revoke https://api.github.com/repos/DEFRA/grants-config-example-grants/tags)
TAG=$(echo "$TAGS_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.parse(d)[0].name))")
echo "Fetching example-grant-with-auth submission schema at version $TAG"
curl -fL --ssl-no-revoke "https://raw.githubusercontent.com/DEFRA/grants-config-example-grants/$TAG/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth-submission.schema.json" -o schemas/example-grant-with-auth-submission.schema.json

./node_modules/.bin/cucumber-js --config cucumber.local.js
