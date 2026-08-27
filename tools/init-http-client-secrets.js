/* eslint-disable */
/**
 * HTTP Client Secrets Initialiser
 *
 * Creates (or updates) a skeleton `http-client.private.env.json` so developers
 * can start using the collections in `http-client/` (broker/dal/gas/land-grants)
 * as quickly as possible.
 *
 * For every environment listed in the committed `http-client.env.json`
 * (local, dev, test, perf-test, ext-test, ...) it ensures the full set of
 * secret keys the `.http` requests reference is present. Entries are grouped by
 * the http-client/*.http file that uses them (each group separated by a blank
 * line), and secrets that must be populated by hand are left as empty strings so
 * the shape is obvious:
 *
 *   - entraClientId       (dal.http)
 *   - entraClientSecret   (dal.http)
 *   - entraTenantId       (dal.http)
 *   - serviceToken        (gas.http)   -- local value pre-filled from compose.gas.yml
 *   - x-api-key           (gas.http)
 *   - defraIdToken        (dal.http / land-grants.http)
 *
 * The two encrypted bearer tokens are generated automatically for the target
 * environment (default `local`) using the same AES-256-GCM routine the app uses
 * (see encryptToken in src/server/common/helpers/auth/encrypt-token.js):
 *
 *   - brokerAuthToken     from CONFIG_BROKER_AUTH_TOKEN / CONFIG_BROKER_ENCRYPTION_KEY
 *   - landGrantsAuthToken from LAND_GRANTS_API_AUTH_TOKEN / LAND_GRANTS_API_ENCRYPTION_KEY
 *
 * Raw tokens and encryption keys are read from your .env file, defaulting to the
 * compose development values if not set.
 *
 * Existing values are preserved; obsolete keys (e.g. dalDeveloperKey, authToken)
 * are dropped. The file is never committed -- keep it listed in .gitignore.
 *
 * Usage:
 *   node tools/init-http-client-secrets.js              # Skeleton for all envs, tokens under "local"
 *   node tools/init-http-client-secrets.js --env dev    # Generate encrypted tokens under the "dev" env
 */

import { readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import 'dotenv/config'
import { encryptToken } from '../src/server/common/helpers/auth/encrypt-token.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const publicEnvPath = join(rootDir, 'http-client.env.json')
const privateEnvPath = join(rootDir, 'http-client.private.env.json')
const composeGasPath = join(rootDir, 'compose.gas.yml')

/**
 * The canonical secret keys grouped by the `http-client/` collection that uses
 * them. Groups are written into every environment in order and separated by a
 * blank line (see serializeConfig) so it stays clear which `.http` client each
 * block of entries serves. The keys map to the `{{placeholders}}` used across
 * `http-client/`.
 */
const SECRET_GROUPS = [
  {
    client: 'dal.http',
    keys: ['entraClientId', 'entraClientSecret', 'entraTenantId']
  },
  {
    client: 'gas.http',
    keys: ['serviceToken', 'x-api-key']
  },
  {
    client: 'broker.http',
    keys: ['brokerAuthToken']
  },
  {
    client: 'land-grants.http',
    keys: ['landGrantsAuthToken']
  },
  {
    client: 'dal.http / land-grants.http',
    keys: ['defraIdToken']
  }
]

/**
 * The encrypted bearer tokens this tool can generate. Each entry maps a key in
 * http-client.private.env.json to the raw token and encryption key used to
 * build the encrypted bearer value the backend expects.
 */
const generatedTokens = [
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

/**
 * Reads and parses a JSON file, returning {} when it does not exist or is empty.
 * A present-but-empty (or whitespace-only) file is treated the same as a missing
 * one so the tool can (re)initialise it instead of failing on JSON.parse.
 * @param {string} path
 * @returns {Promise<Record<string, any>>}
 */
async function readJsonIfPresent(path) {
  try {
    const content = await readFile(path, 'utf-8')
    if (content.trim() === '') {
      return {}
    }
    return JSON.parse(content)
  } catch (/** @type {any} */ error) {
    if (error.code === 'ENOENT') {
      return {}
    }
    throw error
  }
}

/**
 * Reads the local GAS service token (GAS_API_AUTH_TOKEN) from compose.gas.yml so
 * the `local` environment's serviceToken can be pre-filled to match the token the
 * local GAS backend accepts. Returns '' when the file or key is not found.
 * @returns {Promise<string>}
 */
async function readLocalServiceToken() {
  try {
    const content = await readFile(composeGasPath, 'utf-8')
    const match = content.match(/GAS_API_AUTH_TOKEN:\s*([^\s#]+)/)
    return match ? match[1] : ''
  } catch (/** @type {any} */ error) {
    if (error.code === 'ENOENT') {
      return ''
    }
    throw error
  }
}

const envIndex = process.argv.indexOf('--env')
const targetEnv = envIndex !== -1 ? process.argv[envIndex + 1] : 'local'

const publicConfig = await readJsonIfPresent(publicEnvPath)
const existingConfig = await readJsonIfPresent(privateEnvPath)
const localServiceToken = await readLocalServiceToken()

// Cover every environment declared publicly, plus any custom ones already present.
const environments = [...new Set([...Object.keys(publicConfig), ...Object.keys(existingConfig)])]
if (environments.length === 0) {
  environments.push('local')
}

const generated = generatedTokens.map(({ key, token, encryptionKey }) => ({
  key,
  value: buildAuthToken(token, encryptionKey)
}))

/** @type {Record<string, Record<string, string>>} */
const nextConfig = {}

for (const env of environments) {
  const existing = existingConfig[env] ?? {}
  /** @type {Record<string, string>} */
  const envConfig = {}

  for (const group of SECRET_GROUPS) {
    for (const key of group.keys) {
      let value = typeof existing[key] === 'string' ? existing[key] : ''
      // Pre-fill the local serviceToken from compose.gas.yml (GAS_API_AUTH_TOKEN)
      // so it matches the token the local GAS backend accepts, without clobbering
      // any value the developer already set.
      if (key === 'serviceToken' && env === 'local' && value === '' && localServiceToken) {
        value = localServiceToken
      }
      envConfig[key] = value
    }
  }

  // Only the target env receives freshly generated encrypted tokens; other
  // environments keep whatever real, environment-specific values they had.
  if (env === targetEnv) {
    for (const { key, value } of generated) {
      envConfig[key] = value
    }
  }

  nextConfig[env] = envConfig
}

/**
 * Serialises the private-env config to JSON, inserting a blank line between each
 * secret group (see SECRET_GROUPS) so the file stays readable without needing
 * comment-style marker keys. Blank lines are valid JSON whitespace, so the file
 * is still parsed correctly by the HTTP client and this tool.
 * @param {Record<string, Record<string, string>>} config
 * @param {string[]} envs
 * @returns {string}
 */
function serializeConfig(config, envs) {
  const indent = '  '
  const serializeEnv = (envConfig) => {
    const inner = indent + indent
    const groupBlocks = SECRET_GROUPS.map((group) =>
      group.keys.map((key) => `${inner}${JSON.stringify(key)}: ${JSON.stringify(envConfig[key])}`).join(',\n')
    )
    return `{\n${groupBlocks.join(',\n\n')}\n${indent}}`
  }
  const envBlocks = envs.map((env) => `${indent}${JSON.stringify(env)}: ${serializeEnv(config[env])}`)
  return `{\n${envBlocks.join(',\n')}\n}\n`
}

await writeFile(privateEnvPath, serializeConfig(nextConfig, environments), 'utf-8')

console.log(`Initialised http-client.private.env.json for: ${environments.join(', ')}`)
console.log(`Generated encrypted tokens under "${targetEnv}":`)
for (const { key, value } of generated) {
  console.log(`  ${key}: ${value}`)
}
console.log(
  'Populate the manual secrets (entraClientId, entraClientSecret, entraTenantId, serviceToken, x-api-key, defraIdToken) as needed.'
)
