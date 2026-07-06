#!/bin/bash
set -e

# Stops the shared Docker test stack used by acceptance and K6 test runs.

COMPOSE_FILES=(compose.yml compose.ha.yml compose.land-grants.yml compose.ci.yml)
if [ -n "${COMPOSE_FILE_OVERRIDE:-}" ]; then
  COMPOSE_FILES+=("${COMPOSE_FILE_OVERRIDE}")
fi

COMPOSE_ARGS=()
for compose_file in "${COMPOSE_FILES[@]}"; do
  COMPOSE_ARGS+=(-f "${compose_file}")
done

TEST_COMPOSE_FILES=(compose.tests.yml)
if [ -n "${COMPOSE_TESTS_FILE_OVERRIDE:-}" ]; then
  TEST_COMPOSE_FILES+=("${COMPOSE_TESTS_FILE_OVERRIDE}")
fi

TEST_COMPOSE_ARGS=()
for compose_file in "${TEST_COMPOSE_FILES[@]}"; do
  TEST_COMPOSE_ARGS+=(-f "${compose_file}")
done

echo "Cleaning up docker compose stacks..."
docker compose "${COMPOSE_ARGS[@]}" down -v || true
docker compose "${TEST_COMPOSE_ARGS[@]}" down -v || true
