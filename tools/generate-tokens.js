/* eslint-disable */
/**
 * Encrypted Bearer Token Generator for HTTP Client Testing
 *
 * Generates the encrypted bearer tokens the HTTP client needs to authenticate
 * with the downstream services, using the same AES-256-GCM routine the app uses
 * (see encryptToken in src/server/common/helpers/auth/encrypt-token.js).
 *
 * It produces both:
 *   - brokerAuthToken     from CONFIG_BROKER_AUTH_TOKEN / CONFIG_BROKER_ENCRYPTION_KEY
 *   - landGrantsAuthToken from LAND_GRANTS_API_AUTH_TOKEN / LAND_GRANTS_API_ENCRYPTION_KEY
 *
 * Values are read from your .env file, defaulting to the compose development
 * values if not set.
 *
 * Usage:
 *   node tools/generate-tokens.js                     # Prints tokens to console
 *   node tools/generate-tokens.js --save              # Saves to http-client.private.env.json
 *   node tools/generate-tokens.js --save --env dev    # Saves under the "dev" environment key
 */

import { readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import 'dotenv/config'
import { encryptToken } from '../src/server/common/helpers/auth/encrypt-token.js'

/**
 * The set of tokens to generate. Each entry maps a key in
 * http-client.private.env.json to the raw token and encryption key used to
 * build the encrypted bearer value the backend expects.
 */
const tokens = [
  {
    key: 'brokerAuthToken',
    token: process.env.CONFIG_BROKER_AUTH_TOKEN ?? 'config-broker-auth-token',
    encryptionKey: process.env.CONFIG_BROKER_ENCRYPTION_KEY ?? 'config-broker-encryption-key'
  },
  {
    key: 'landGrantsAuthToken',
    token: process.env.LAND_GRANTS_API_AUTH_TOKEN ?? 'auth_token',
    encryptionKey: process.env.LAND_GRANTS_API_ENCRYPTION_KEY ?? 'encryption_key'
  }
]

/**
 * Builds the encrypted + base64 bearer credentials, matching
 * createAuthenticatedHeaders in backend-auth-helper.js.
 * @param {string} token
 * @param {string} encryptionKey
 * @returns {string}
 */
function buildAuthToken(token, encryptionKey) {
  return Buffer.from(encryptToken(token, encryptionKey)).toString('base64')
}

const generated = tokens.map(({ key, token, encryptionKey }) => ({
  key,
  value: buildAuthToken(token, encryptionKey)
}))

const shouldSave = process.argv.includes('--save')
const envIndex = process.argv.indexOf('--env')
const targetEnv = envIndex !== -1 ? process.argv[envIndex + 1] : 'local'

if (shouldSave) {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const httpClientEnvPath = join(__dirname, '..', 'http-client.private.env.json')

  /** @type {any} */
  let config = {}

  try {
    const fileContent = await readFile(httpClientEnvPath, 'utf-8')
    config = JSON.parse(fileContent)
  } catch (/** @type {any} */ error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  config[targetEnv] ??= {}

  for (const { key, value } of generated) {
    config[targetEnv][key] = value
  }

  await writeFile(httpClientEnvPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')

  const savedKeys = generated.map(({ key }) => `${targetEnv}.${key}`).join(', ')
  console.log(`Tokens saved to http-client.private.env.json under ${savedKeys}`)
}

for (const { key, value } of generated) {
  console.log(`${key}: ${value}`)
}
