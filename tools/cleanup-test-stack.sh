#!/bin/bash
set -e

# Stops the shared Docker test stack used by acceptance and K6 test runs.

COMPOSE_COMMAND='docker compose -f compose.yml -f compose.ha.yml -f compose.land-grants.yml -f compose.ci.yml'

echo "Cleaning up docker compose stacks..."
eval "${COMPOSE_COMMAND} down -v" || true
docker compose -f compose.tests.yml down -v || true
