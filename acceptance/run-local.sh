#!/bin/bash
set -e

# Runs all scenarios tagged @runme against the local environment.
# Tag a scenario with @runme in the feature file to include it in this run.

cd "$(dirname "$0")"

npm install --silent

export DEFRA_ID_USER_PASSWORD=x
export GRANTS_UI_BACKEND_AUTH_TOKEN=auth_token
export GRANTS_UI_BACKEND_ENCRYPTION_KEY=encryption_key
export APPLICATION_LOCK_TOKEN_SECRET=dev-lock-secret
export MOCKSERVER_HOST=localhost
export MOCKSERVER_PORT=1080

./node_modules/.bin/wdio run wdio.local.conf.js
