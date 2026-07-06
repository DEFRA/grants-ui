#!/bin/bash
set -e

# Runs acceptance test containers against an already running Docker test stack.

TEST_COMMAND='npm run test:ci'
FEATURE_FILE="${1:-}"

if [ -n "$FEATURE_FILE" ]; then
  TEST_COMMAND="$TEST_COMMAND -- --spec $FEATURE_FILE"
fi

docker compose -f compose.tests.yml run --quiet-pull --rm grants-ui-acceptance-tests $TEST_COMMAND
docker compose -f compose.tests.yml run --quiet-pull --rm land-grants-journey-tests $TEST_COMMAND
docker compose -f compose.tests.yml run --quiet-pull --rm woodland-grant-journey-tests $TEST_COMMAND
docker compose -f compose.tests.yml down
