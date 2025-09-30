#!/bin/bash
set -e

export ACCEPTANCE_TESTS_HOOK='
  docker compose -f gae-compose.yml run --quiet-pull --rm gae-acceptance-tests &&
  docker compose -f gae-compose.yml down
'

"$(dirname "$0")/docker-compose-smoke-test.sh"
