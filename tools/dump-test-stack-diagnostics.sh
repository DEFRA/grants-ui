#!/bin/bash
set -e

# Dumps diagnostics for the shared Docker test stack before cleanup.

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

echo ""
echo "--- Current Service Status ---"
docker compose "${COMPOSE_ARGS[@]}" ps || true
docker compose "${TEST_COMPOSE_ARGS[@]}" ps || true

for service in grants-ui grants-ui-backend grants-config-broker localstack fcp-defra-id-stub; do
  echo ""
  echo "--- ${service} Service Logs ---"
  docker compose "${COMPOSE_ARGS[@]}" logs --no-color --tail=300 "${service}" || true
done

echo ""
echo "--- LocalStack Resources ---"
docker compose "${COMPOSE_ARGS[@]}" exec -T localstack aws --endpoint-url=http://localhost:4566 s3 ls || true
docker compose "${COMPOSE_ARGS[@]}" exec -T localstack aws --endpoint-url=http://localhost:4566 sqs list-queues || true
docker compose "${COMPOSE_ARGS[@]}" exec -T localstack aws --endpoint-url=http://localhost:4566 sns list-topics || true
