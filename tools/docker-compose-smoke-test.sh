#!/bin/bash
set -e

if ! command -v docker &> /dev/null; then
    echo "Error: docker is not installed or not in PATH"
    exit 1
fi

echo "Starting services with docker-compose..."
docker-compose up -d --build

echo "Waiting for services to be healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=60

echo "Waiting for grants-ui service to start..."
until docker-compose ps grants-ui | grep -q "Up"; do
    if [ ${ATTEMPTS} -eq ${MAX_ATTEMPTS} ]; then
        echo "Error: Timed out waiting for grants-ui service to start."
        docker-compose ps
        docker-compose down
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
        docker-compose ps
        echo "--- grants-ui Service Logs ---"
        docker-compose logs grants-ui
        echo "--- Redis Service Logs ---"
        docker-compose logs redis
        docker-compose down
        exit 1
    fi
    printf 'h'
    ATTEMPTS=$(($ATTEMPTS+1))
    sleep 3
done

echo ""
echo "All services are healthy!"
echo ""
echo "Service Status:"
docker-compose ps
docker-compose down
echo ""
echo "Test complete."
