#!/bin/bash
set -e

# Runs K6 performance tests against an already running Docker test stack.

TEST_COMPOSE_FILES=(compose.tests.yml)

if [ -n "${COMPOSE_TESTS_FILE_OVERRIDE:-}" ]; then
  TEST_COMPOSE_FILES+=("${COMPOSE_TESTS_FILE_OVERRIDE}")
fi

TEST_COMPOSE_ARGS=()
for compose_file in "${TEST_COMPOSE_FILES[@]}"; do
  TEST_COMPOSE_ARGS+=(-f "${compose_file}")
done

docker compose "${TEST_COMPOSE_ARGS[@]}" run --quiet-pull --rm grants-ui-performance-tests
