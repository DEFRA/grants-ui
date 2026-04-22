/* eslint-disable */
/**
 * Broker Token Generator for HTTP Client Testing
 *
 * Generates an encrypted bearer token for authenticating with the config broker.
 * Reads CONFIG_BROKER_AUTH_TOKEN and CONFIG_BROKER_ENCRYPTION_KEY from your .env file
 * (defaults to compose.yml development values if not set).
 *
 * Usage:
 *   node scripts/generate-broker-token.js                     # Prints token to console
 *   node scripts/generate-broker-token.js --save              # Saves to http-client.private.env.json
 *   node scripts/generate-broker-token.js --save --env dev    # Saves under the "dev" environment key
 */

import { readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import 'dotenv/config'
import crypto from 'node:crypto'

const token = process.env.CONFIG_BROKER_AUTH_TOKEN ?? 'config-broker-auth-token'
const encryptionKey = process.env.CONFIG_BROKER_ENCRYPTION_KEY ?? 'config-broker-encryption-key'

const iv = crypto.randomBytes(12)
const key = crypto.scryptSync(encryptionKey, 'salt', 32)
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

let encrypted = cipher.update(token, 'utf8', 'base64')
encrypted += cipher.final('base64')

const authTag = cipher.getAuthTag()
const encryptedToken = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
const brokerAuthToken = Buffer.from(encryptedToken).toString('base64')

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
  config[targetEnv].brokerAuthToken = brokerAuthToken

  await writeFile(httpClientEnvPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  console.log(`Token saved to http-client.private.env.json under "${targetEnv}.brokerAuthToken"`)
}

console.log(brokerAuthToken)
