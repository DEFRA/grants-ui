#!/bin/bash
set -e

# Usage:
#   Run all acceptance and performance tests:
#     ./tools/run-all-tests.sh

TEST_COMMAND='npm run test:ci'

"$(dirname "$0")/generate-users-csv.sh"

export ACCEPTANCE_TESTS_HOOK="
  docker compose -f compose.tests.yml run --quiet-pull --rm gae-acceptance-tests $TEST_COMMAND &&
  docker compose -f compose.tests.yml run --quiet-pull --rm land-grants-journey-tests $TEST_COMMAND &&
  docker compose -f compose.tests.yml down
"

export PERFORMANCE_TESTS_HOOK="
  docker compose -f compose.tests.yml run --quiet-pull --rm grants-ui-performance-tests &&
  docker compose -f compose.tests.yml down
"

"$(dirname "$0")/docker-compose-smoke-test.sh"
