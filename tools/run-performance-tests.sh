#!/bin/bash
set -e

# Usage:
#   Run all performance tests:
#     ./tools/run-performance-tests.sh

export PERFORMANCE_TESTS_HOOK="
  docker compose -f compose.tests.yml run --quiet-pull --rm grants-ui-performance-tests &&
  docker compose -f compose.tests.yml down
"

"$(dirname "$0")/docker-compose-smoke-test.sh"
