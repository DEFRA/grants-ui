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

echo "Setting environment variables"
export WELL_KNOWN_HOST_OVERRIDE=https://nginx:4007
export WELL_KNOWN_API_HOST_OVERRIDE=https://nginx:4007
export DEFRA_ID_REDIRECT_URL=https://nginx:4000/auth/sign-in-oidc
export DEFRA_ID_SIGN_OUT_REDIRECT_URL=https://nginx:4000/auth/sign-out-oidc
export APP_BASE_URL=https://nginx:4000
export AUTH_OVERRIDE=""
export DEFRA_ID_WELL_KNOWN_URL=https://nginx:4007/idphub/b2c/b2c_1a_cui_cpdev_signupsigninsfi/.well-known/openid-configuration

echo "Starting services with docker compose..."
docker compose up -d --build

echo "Waiting for services to be healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=60

echo "Waiting for grants-ui service to start..."
until docker compose ps grants-ui | grep -q "Up"; do
    if [ ${ATTEMPTS} -eq ${MAX_ATTEMPTS} ]; then
        echo "Error: Timed out waiting for grants-ui service to start."
        docker compose ps
        docker compose down
        exit 1
    fi
    printf '.'
    ATTEMPTS=$(($ATTEMPTS+1))
    sleep 2
done

echo "Service started, now waiting for health check to pass..."

ATTEMPTS=0

until curl -f http://localhost:3000/health >/dev/null 2>&1; do
    if [ ${ATTEMPTS} -eq ${MAX_ATTEMPTS} ]; then
        echo "Error: Timed out waiting for grants-ui service to be accessible."
        echo "--- Current Service Status ---"
        docker compose ps
        echo "--- grants-ui Service Logs ---"
        docker compose logs grants-ui
        echo "--- Redis Service Logs ---"
        docker compose logs redis
        docker compose down
        exit 1
    fi
    printf 'h'
    ATTEMPTS=$(($ATTEMPTS+1))
    sleep 3
done

echo "All services are healthy!"
echo "Service Status:"
docker compose ps

echo "Running Acceptance Tests"
cd acceptance
docker compose run --build --rm acceptance-tests
docker compose down

cd ..
#docker compose down
echo ""
echo "Tests complete."
