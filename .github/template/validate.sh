#!/bin/bash

compose_file='.github/template/template-compose.yml'

checkRedis() {
  echo "checking redis"
  output=$(docker compose -f "$compose_file" exec -it redis redis-cli --tls --insecure CLIENT LIST | grep -c 'user=username')
  if [ "$output" -gt 0 ]; then
    echo  " ✔ Service logged into redis."
    return 0
  else
    echo " ❌ Service not connected to redis with user."
    echo ""
    return 1
  fi
}

checkUrl() {
    URL=$1

    set +e
    # Call the URL and get the HTTP status code
    HTTP_STATUS=$(curl -o /dev/null -s -w "%{http_code}\n" "$URL")
    set -e

    # Check if the HTTP status code is 200
    if [ "$HTTP_STATUS" -eq 200 ]; then
        echo " ✔ $URL returned a 200 OK status."
        return 0
    else
        echo " ❌ $URL returned a status of $HTTP_STATUS. Exiting with code 1."
        return 1
    fi
}

checkLogSchema() {
    set +e
    local log
    log=$(docker compose -f "$compose_file" logs service -n 1 --no-color --no-log-prefix 2>/dev/null)

    # Check if jq validation was successful
    if echo "$log" | jq empty > /dev/null; then
      echo " ✔ Log entry is valid JSON."
      set -e
      return 0
    else
      echo " ❌ Log entry is not valid JSON."
      set -e
      return 1
    fi
}

generate_cert() {
    local name="$1"
    local cn="$2"
    local opts="$3"
    mkdir -p tests/tls
    local keyfile=.github/template/tests/tls/${name}.key
    local certfile=.github/template/tests/tls/${name}.crt

    [ -f "$keyfile" ] || openssl genrsa -out "$keyfile" 2048
    openssl req \
        -new -sha256 \
        -subj "/C=UK/ST=STATE/L=CITY/O=ORG_NAME/OU=OU_NAME/CN=redis" \
        -addext "subjectAltName = DNS:localhost, DNS:redis" \
        -key "$keyfile" | \
        openssl x509 \
            -req -sha256 \
            -CA .github/template/tests/tls/ca.crt \
            -CAkey .github/template/tests/tls/ca.key \
            -days 999 \
            -out "$certfile"
}

setup() {
  set -e

  mkdir -p .github/template/tests/tls
  [ -f .github/template/tests/tls/ca.key ] || openssl genrsa -out .github/template/tests/tls/ca.key 2048

  echo 'generating ca.crt'
  openssl req \
      -x509 -new -nodes -sha256 \
      -key .github/template/tests/tls/ca.key \
      -days 3650 \
      -subj '/O=Redis Test/CN=Certificate Authority' \
      -out .github/template/tests/tls/ca.crt

  echo 'generating ca.pem'
  cat .github/template/tests/tls/ca.crt > .github/template/tests/tls/ca.pem

  echo 'generating redis certs'
  generate_cert 'redis' 'redis'
  caPem="$(base64 .github/template/tests/tls/ca.crt)"
  export REDIS_TEST_CA=$caPem
  # Required for redis container to be able to read the certs.
  chmod 777 .github/template/tests/tls/*

  echo 'starting docker'
  echo $REDIS_TEST_CA
  # Start mongodb + templated service
  REDIS_TEST_CA=$caPem docker compose -f "$compose_file" up --wait --wait-timeout 60 -d --quiet-pull
  sleep 3
}

# Stop docker on exist and cleanup tmp files
cleanup() {
    rv=$?
    echo "cleaning up $rv"
    rm -rf .github/template/tests/*
    docker compose -f "$compose_file" logs service
    docker compose -f "$compose_file" down
    exit $rv
}
trap cleanup EXIT

run_tests() {
  # Run the tests
  echo "-- Running template tests ---"

  # Check endpoints respond
  checkUrl "http://localhost:8085/health"
  checkUrl "http://localhost:8085/"

  checkRedis

  # Check its using ECS
  checkLogSchema
}

# Start Docker
setup
run_tests

