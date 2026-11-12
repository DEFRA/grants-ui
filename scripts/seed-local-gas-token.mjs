/* eslint-disable no-console */
// Mounted inside GAS by compose.gas.yml; imports use the GAS image's modules.
import { up } from 'migrate-mongo'
import { db, mongoClient } from '../src/common/mongo-client.js'

const id = process.env.GAS_API_AUTH_TOKEN_HASH
if (!/^[a-f0-9]{64}$/.test(id ?? '')) {
  throw new Error('GAS_API_AUTH_TOKEN_HASH must be a SHA-256 hash')
}

try {
  // On a fresh database the first migration drops access_tokens. Run it before
  // seeding; GAS's normal startup then finds these migrations already applied.
  await up(db, mongoClient)
  const result = await db.collection('access_tokens').updateOne(
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
  console.log(
    result.upsertedCount ? 'Registered local Grants UI GAS token' : 'Local Grants UI GAS token already registered'
  )
} finally {
  await mongoClient.close()
}
