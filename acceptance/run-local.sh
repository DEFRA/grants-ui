#!/bin/bash
set -e

# Runs all scenarios tagged @runme against the local environment.
# Tag a scenario with @runme in the feature file to include it in this run.

cd "$(dirname "$0")"

npm install --silent

./node_modules/.bin/cucumber-js --config cucumber.local.js
