#!/usr/bin/env bash
set -euo pipefail

# Only mounted by compose.gas.yml
mongosh "mongodb://${PRIMARY:-mongodb:27017}/?directConnection=true" --quiet --file /dev/stdin <<'JS'
const id = process.env.GAS_API_AUTH_TOKEN_HASH
if (!/^[a-f0-9]{64}$/.test(id ?? '')) {
  throw new Error('GAS_API_AUTH_TOKEN_HASH must be a SHA-256 hash')
}

const result = db.getSiblingDB('fg-gas-backend').access_tokens.updateOne(
  { id },
  {
    $setOnInsert: {
      client: 'grants-ui',
      clientId: 'grants-ui',
      createdAt: new Date(),
      createdBy: 'local-compose',
      expiresAt: null
    }
  },
  { upsert: true }
)
print(result.upsertedCount ? 'Registered local Grants UI GAS token' : 'Local Grants UI GAS token already registered')
JS
