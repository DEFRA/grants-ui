#!/bin/bash
set -e

# Usage:
#   Run all acceptance and performance tests:
#     ./tools/run-all-tests.sh

cleanup() {
  status=$?
  trap - EXIT

  if [ "${status}" -ne 0 ]; then
    "$(dirname "$0")/dump-test-stack-diagnostics.sh"
  fi

  "$(dirname "$0")/cleanup-test-stack.sh"

  exit "${status}"
}
trap cleanup EXIT

RUN_TEST_HOOKS=false CLEANUP_ON_EXIT=false "$(dirname "$0")/prepare-docker-test-stack.sh"
"$(dirname "$0")/run-acceptance-test-containers.sh"
"$(dirname "$0")/run-performance-test-containers.sh"
