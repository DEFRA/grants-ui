#!/bin/bash
set -e

# Runs K6 performance tests against an already running Docker test stack.

docker compose -f compose.tests.yml run --quiet-pull --rm grants-ui-performance-tests
