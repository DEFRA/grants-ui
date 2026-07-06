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

DIAGNOSTICS_DUMPED=false

dump_diagnostics() {
  if [ "${DIAGNOSTICS_DUMPED}" = "true" ]; then
    return
  fi

  DIAGNOSTICS_DUMPED=true

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
}

# Guarantee teardown of both the main stack and the ephemeral test stack on
# any exit (success, failure, or interrupt). This ensures that even if a test
# suite hook exits non-zero under `set -e`, containers, networks and volumes
# are still cleaned up instead of being left running locally.
cleanup() {
  status=$?
  trap - EXIT

  if [ "${CLEANUP_ON_EXIT:-true}" != "true" ]; then
    if [ "${status}" -ne 0 ]; then
      echo ""
      echo "Failure detected; dumping docker compose diagnostics before deferred cleanup..."
      dump_diagnostics
    fi

    exit "${status}"
  fi

  if [ "${status}" -ne 0 ]; then
    echo ""
    echo "Failure detected; dumping docker compose diagnostics before cleanup..."
    dump_diagnostics
  fi

  echo ""
  echo "Cleaning up docker compose stacks..."
  docker compose "${COMPOSE_ARGS[@]}" down -v || true
  docker compose "${TEST_COMPOSE_ARGS[@]}" down -v || true

  exit "${status}"
}
trap cleanup EXIT

echo "Running pre-emptive volume cleanse..."
docker volume prune -f
echo "Building docker compose containers..."
docker compose "${COMPOSE_ARGS[@]}" build --quiet > /dev/null 2>&1
echo "Starting services with docker compose..."
docker compose "${COMPOSE_ARGS[@]}" up -d --quiet-pull --scale grants-ui=2 --scale grants-ui-backend=2

echo "Waiting for services to be healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=60

echo "Waiting for grants-ui service to start..."
until docker compose ps grants-ui | grep -q "Up"; do
    if [ ${ATTEMPTS} -eq ${MAX_ATTEMPTS} ]; then
        echo "Error: Timed out waiting for grants-ui service to start."
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
        exit 1
    fi
    printf 'h'
    ATTEMPTS=$(($ATTEMPTS+1))
    sleep 3
done

echo "All services are healthy!"

echo "Waiting for example-grant-with-auth backend definition to be available..."
ATTEMPTS=0
READINESS_OUTPUT=""
until READINESS_OUTPUT=$(node ./tools/check-backend-form-definition-ready.js 2>&1); do
    if [ ${ATTEMPTS} -eq ${MAX_ATTEMPTS} ]; then
        echo "Error: Timed out waiting for example-grant-with-auth backend definition to be available."
        echo "${READINESS_OUTPUT}"
        exit 1
    fi
    printf 'f'
    ATTEMPTS=$(($ATTEMPTS+1))
    sleep 3
done
echo "${READINESS_OUTPUT}"

echo "Service Status:"
docker compose ps

if [ "${RUN_TEST_HOOKS:-true}" = "true" ]; then
  if [ -n "${ACCEPTANCE_TESTS_HOOK:-}" ]; then
    echo "Running Acceptance Tests..."
    eval "${ACCEPTANCE_TESTS_HOOK}"
  fi

  if [ -n "${PERFORMANCE_TESTS_HOOK:-}" ]; then
    echo "Running Performance Tests..."
    eval "${PERFORMANCE_TESTS_HOOK}"
  fi
fi

# Teardown is handled by the cleanup() trap registered above.
echo ""
echo "Docker test stack ready."
