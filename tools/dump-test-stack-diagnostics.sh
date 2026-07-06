#!/bin/bash
set -e

# Dumps diagnostics for the shared Docker test stack before cleanup.

COMPOSE_COMMAND='docker compose -f compose.yml -f compose.ha.yml -f compose.land-grants.yml -f compose.ci.yml'

echo ""
echo "--- Current Service Status ---"
eval "${COMPOSE_COMMAND} ps" || true
docker compose -f compose.tests.yml ps || true

for service in grants-ui grants-ui-backend grants-config-broker localstack fcp-defra-id-stub; do
  echo ""
  echo "--- ${service} Service Logs ---"
  eval "${COMPOSE_COMMAND} logs --no-color --tail=300 ${service}" || true
done

echo ""
echo "--- LocalStack Resources ---"
eval "${COMPOSE_COMMAND} exec -T localstack aws --endpoint-url=http://localhost:4566 s3 ls" || true
eval "${COMPOSE_COMMAND} exec -T localstack aws --endpoint-url=http://localhost:4566 sqs list-queues" || true
eval "${COMPOSE_COMMAND} exec -T localstack aws --endpoint-url=http://localhost:4566 sns list-topics" || true
