#!/bin/bash
set -e

# Usage:
#   Run all acceptance tests:
#     ./tools/run-acceptance-tests.sh

export ACCEPTANCE_TESTS_HOOK="
  docker compose -f compose.tests.yml run --quiet-pull --build --rm grants-ui-acceptance-tests npm run test:ci &&
  docker compose -f compose.tests.yml run --quiet-pull --rm land-grants-journey-tests npm run test:ci &&
  docker compose -f compose.tests.yml run --quiet-pull --rm woodland-grant-journey-tests npm run test:ci &&
  docker compose -f compose.tests.yml down -v
"

"$(dirname "$0")/docker-compose-smoke-test.sh"
