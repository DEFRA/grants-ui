#!/bin/bash
set -e

# Usage:
#   Run all acceptance tests:
#     ./tools/run-acceptance-tests.sh
#
#   Run a specific feature file:
#     ./tools/run-acceptance-tests.sh ./test/features/example-whitelist/whitelist.feature

TEST_COMMAND='npm run test:ci'
FEATURE_FILE="${1:-}"

if [ -n "$FEATURE_FILE" ]; then
  TEST_COMMAND="$TEST_COMMAND -- --spec $FEATURE_FILE"
fi

export ACCEPTANCE_TESTS_HOOK="
  docker compose -f gae-compose.yml run --quiet-pull --rm gae-acceptance-tests $TEST_COMMAND &&
  docker compose -f gae-compose.yml down
"

"$(dirname "$0")/docker-compose-smoke-test.sh"

