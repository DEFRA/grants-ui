#!/bin/bash
set -e

export ACCEPTANCE_TESTS_HOOK='
  echo "Running GAE Acceptance Tests" &&
  docker compose -f gae-compose.yml run --build --rm gae-acceptance-tests &&
  docker compose -f gae-compose.yml down
'

"$(dirname "$0")/docker-compose-smoke-test.sh"
