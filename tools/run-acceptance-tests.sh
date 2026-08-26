#!/bin/bash
set -e

# Usage:
#   Run all acceptance tests:
#     ./tools/run-acceptance-tests.sh
#
#   Run a specific feature file:
#     ./tools/run-acceptance-tests.sh ./acceptance/test/features/allowlist.feature

TEST_COMMAND='npm run test:ci'
FEATURE_FILE="${1:-}"

if [ -n "$FEATURE_FILE" ]; then
  TEST_COMMAND="$TEST_COMMAND -- --spec $FEATURE_FILE"
fi

# Suites to run, space-separated. Default is all four (what CI runs — do not
# change that default). Override locally to scope a run, e.g.
#   ACCEPTANCE_SUITES="grants-ui-acceptance-tests" ./tools/run-acceptance-tests.sh
# The grasslands/ woodland suites include @ci tests that assume
# CI-seeded allowlist state absent in a plain local stack.
ACCEPTANCE_SUITES="${ACCEPTANCE_SUITES:-grants-ui-acceptance-tests grants-ui-grasslands-tests grants-ui-woodland-tests}"

# TGC-1504: Disabled for repeater pattern
GRASSLANDS_DISABLED_TEST='submits a Grasslands application exploring all pages from start to confirmation'

HOOK=""
for suite in $ACCEPTANCE_SUITES; do
  suite_command="$TEST_COMMAND"
  if [ "$suite" = "grants-ui-grasslands-tests" ] && [ -z "$FEATURE_FILE" ]; then
    suite_command="$suite_command -- --grep-invert \"$GRASSLANDS_DISABLED_TEST\" --pass-with-no-tests"
  fi
  step="docker compose -f compose.tests.yml run --quiet-pull --rm ${suite} $suite_command"
  if [ -z "$HOOK" ]; then HOOK="$step"; else HOOK="$HOOK && $step"; fi
done
export ACCEPTANCE_TESTS_HOOK="$HOOK"

"$(dirname "$0")/docker-compose-smoke-test.sh"
