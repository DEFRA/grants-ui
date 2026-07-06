#!/bin/bash
set -e

# Runs acceptance test containers against an already running Docker test stack.

FEATURE_FILE="${1:-}"
TEST_COMMAND_ARGS=(npm run test:ci)
TEST_COMPOSE_FILES=(compose.tests.yml)

if [ -n "${COMPOSE_TESTS_FILE_OVERRIDE:-}" ]; then
  TEST_COMPOSE_FILES+=("${COMPOSE_TESTS_FILE_OVERRIDE}")
fi

TEST_COMPOSE_ARGS=()
for compose_file in "${TEST_COMPOSE_FILES[@]}"; do
  TEST_COMPOSE_ARGS+=(-f "${compose_file}")
done

if [ -n "$FEATURE_FILE" ]; then
  TEST_COMMAND_ARGS+=(-- --spec "${FEATURE_FILE}")
fi

docker compose "${TEST_COMPOSE_ARGS[@]}" run --quiet-pull --rm grants-ui-acceptance-tests "${TEST_COMMAND_ARGS[@]}"
docker compose "${TEST_COMPOSE_ARGS[@]}" run --quiet-pull --rm land-grants-journey-tests "${TEST_COMMAND_ARGS[@]}"
docker compose "${TEST_COMPOSE_ARGS[@]}" run --quiet-pull --rm woodland-grant-journey-tests "${TEST_COMMAND_ARGS[@]}"
docker compose "${TEST_COMPOSE_ARGS[@]}" down
