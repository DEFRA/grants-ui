#!/bin/bash
set -e

# Detect and set up container runtime (Docker or Podman)
CONTAINER_RUNTIME=""
if command -v docker &> /dev/null; then
    CONTAINER_RUNTIME="docker"
    echo "Using Docker as container runtime"
    # Test that docker actually works
    if ! docker --version &> /dev/null; then
        echo "Warning: docker command found but not working properly"
    fi
elif command -v podman &> /dev/null; then
    CONTAINER_RUNTIME="podman"
    echo "Using Podman as container runtime"
    # Test that podman actually works
    if ! podman --version &> /dev/null; then
        echo "Error: podman command found but not working properly"
        exit 1
    fi
    # Create docker function that calls podman
    docker() {
        podman "$@"
    }
else
    echo "Error: Neither docker nor podman is installed or in PATH"
    echo "Please install either Docker or Podman to run this script"
    exit 1
fi

rm -fr localstack/config-broker-local

EXAMPLE_TAG=$(curl -s https://api.github.com/repos/DEFRA/grants-config-example-grants/tags | jq -r '.[0].name')

if [ -z "$EXAMPLE_TAG" ]; then
  echo "Error: Could not fetch example-grant-with-auth tag"
  exit 1
fi

if [ "${USE_LOCAL_CONFIG_DEFINITION:-true}" = "true" ]; then
  echo "Using local version of the config"
  "$(dirname "$0")/setup-local-config.sh"
else
  echo "Using version $EXAMPLE_TAG of the config for example-grant-with-auth"

  mkdir -p localstack/config-broker-local/example-grant-with-auth@$EXAMPLE_TAG
  curl -L https://raw.githubusercontent.com/DEFRA/grants-config-example-grants/$EXAMPLE_TAG/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth.yaml -o localstack/config-broker-local/example-grant-with-auth@$EXAMPLE_TAG/example-grant-with-auth.yaml
  sed "s/^version:.*/version: $EXAMPLE_TAG/" localstack/config-broker/release.yml > localstack/config-broker-local/release.yml
fi

echo "Fetching example-grant-with-auth submission schema at version $EXAMPLE_TAG"
mkdir -p acceptance/schemas
curl -fL "https://raw.githubusercontent.com/DEFRA/grants-config-example-grants/$EXAMPLE_TAG/configurations/example-grant-with-auth/grants-ui/example-grant-with-auth-submission.schema.json" -o acceptance/schemas/example-grant-with-auth-submission.schema.json

WOODLAND_TAG=$(curl -s https://api.github.com/repos/DEFRA/grants-config-woodland/tags | jq -r '.[0].name')

if [ -z "$WOODLAND_TAG" ]; then
  echo "Error: Could not fetch woodland tag"
  exit 1
fi

echo "Fetching woodland GAS schema at version $WOODLAND_TAG"
mkdir -p woodland-grant-journey-tests-schemas
curl -fL "https://raw.githubusercontent.com/DEFRA/grants-config-woodland/$WOODLAND_TAG/configurations/woodland/gas/gas.json" -o woodland-grant-journey-tests-schemas/gas.schema.json

COMPOSE_COMMAND='docker compose -f compose.yml -f compose.ha.yml -f compose.land-grants.yml -f compose.ci.yml'

# Guarantee teardown of both the main stack and the ephemeral test stack on
# any exit (success, failure, or interrupt). This ensures that even if a test
# suite hook exits non-zero under `set -e`, containers, networks and volumes
# are still cleaned up instead of being left running locally.
cleanup() {
  echo ""
  echo "Cleaning up docker compose stacks..."
  if [ -n "${COMPOSE_COMMAND:-}" ]; then
    eval "${COMPOSE_COMMAND} down -v" || true
  fi
  docker compose -f compose.tests.yml down -v || true
}
trap cleanup EXIT

echo "Running pre-emptive volume cleanse..."
docker volume prune -f
echo "Building docker compose containers..."
eval "${COMPOSE_COMMAND} build --quiet > /dev/null 2>&1"
echo "Starting services with docker compose..."
eval "${COMPOSE_COMMAND} up -d --quiet-pull --scale grants-ui=2 --scale grants-ui-backend=2"

echo "Waiting for services to be healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=60

echo "Waiting for grants-ui service to start..."
until docker compose ps grants-ui | grep -q "Up"; do
    if [ ${ATTEMPTS} -eq ${MAX_ATTEMPTS} ]; then
        echo "Error: Timed out waiting for grants-ui service to start."
        docker compose ps
        eval "${COMPOSE_COMMAND} down"
        exit 1
    fi
    printf '.'
    ATTEMPTS=$(($ATTEMPTS+1))
    sleep 2
done

echo "Service started, now waiting for health check to pass..."

ATTEMPTS=0

until curl -skf https://localhost:4000/health >/dev/null 2>&1; do
    if [ ${ATTEMPTS} -eq ${MAX_ATTEMPTS} ]; then
        echo "Error: Timed out waiting for grants-ui service to be accessible."
        echo "--- Current Service Status ---"
        docker compose ps
        echo "--- grants-ui Service Logs ---"
        docker compose logs grants-ui
        echo "--- Redis Service Logs ---"
        docker compose logs redis
        eval "${COMPOSE_COMMAND} down"
        exit 1
    fi
    printf 'h'
    ATTEMPTS=$(($ATTEMPTS+1))
    sleep 3
done

echo "All services are healthy!"

echo "Waiting for example-grant-with-auth form to be loaded into Redis..."
ATTEMPTS=0
until curl -skf https://localhost:4000/dev 2>/dev/null | grep -q "example-grant-with-auth"; do
    if [ ${ATTEMPTS} -eq ${MAX_ATTEMPTS} ]; then
        echo "Error: Timed out waiting for example-grant-with-auth to be seeded."
        docker compose logs grants-ui-backend grants-config-broker
        eval "${COMPOSE_COMMAND} down"
        exit 1
    fi
    printf 'f'
    ATTEMPTS=$(($ATTEMPTS+1))
    sleep 3
done

echo "Service Status:"
docker compose ps

if [ -n "${ACCEPTANCE_TESTS_HOOK:-}" ]; then
  echo "Running Acceptance Tests..."
  eval "${ACCEPTANCE_TESTS_HOOK}"
fi

if [ -n "${PERFORMANCE_TESTS_HOOK:-}" ]; then
  echo "Running Performance Tests..."
  eval "${PERFORMANCE_TESTS_HOOK}"
fi

# Teardown is handled by the cleanup() trap registered above.
echo ""
echo "Tests complete."
