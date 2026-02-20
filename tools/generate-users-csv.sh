#!/bin/bash
set -e

# Generates performance-test-users.csv from fcp-defra-id-stub/users.json for use by performance tests.
# Output: ./performance-test-users.csv (relative to repo root)

USERS_JSON="$(dirname "$0")/../fcp-defra-id-stub/users.json"
OUTPUT="$(dirname "$0")/../performance-test-users.csv"

echo "crn" > "$OUTPUT"
node -e "
  const fs = require('fs');
  const { people } = JSON.parse(fs.readFileSync('$USERS_JSON', 'utf8'));
  people.forEach(p => process.stdout.write(p.crn + '\n'));
" >> "$OUTPUT"

echo "Generated $OUTPUT"
