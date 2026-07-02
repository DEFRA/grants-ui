#!/usr/bin/env node

import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const IV_LENGTH_BYTES = 12
const KEY_LENGTH_BYTES = 32
const SCRYPT_SALT = 'salt'
const CIPHER_ALGORITHM = 'aes-256-gcm'

const DEFAULT_BASE_BACKEND_URL = 'https://localhost:4001'
const DEFAULT_AUTH_TOKEN = 'auth_token'
const DEFAULT_ENCRYPTION_KEY = 'encryption_key'
const DEFAULT_LOCK_TOKEN_SECRET = 'dev-lock-secret'
const DEFAULT_GRANT_CODE = 'example-grant-with-auth'
const DEFAULT_USER_ID = '1100957269'
const DEFAULT_SBI = '107593059'

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function signJwt(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url')
}

export function createBackendAuthorizationHeader({
  authToken,
  encryptionKey,
  iv = crypto.randomBytes(IV_LENGTH_BYTES)
}) {
  const key = crypto.scryptSync(
    required(encryptionKey, 'GRANTS_UI_BACKEND_ENCRYPTION_KEY'),
    SCRYPT_SALT,
    KEY_LENGTH_BYTES
  )
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv)

  let encrypted = cipher.update(required(authToken, 'GRANTS_UI_BACKEND_AUTH_TOKEN'), 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const encryptedToken = `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted}`
  return `Bearer ${Buffer.from(encryptedToken).toString('base64')}`
}

export function mintReadLockToken({ userId, sbi, grantCode, secret, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  }
  const payload = {
    sub: required(userId, 'READINESS_USER_ID'),
    sbi: required(sbi, 'READINESS_SBI'),
    grantCode: required(grantCode, 'READINESS_GRANT_CODE'),
    typ: 'lock',
    iat: nowSeconds,
    aud: 'grants-backend',
    iss: 'grants-ui'
  }
  const body = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`

  return `${body}.${signJwt(body, required(secret, 'APPLICATION_LOCK_TOKEN_SECRET'))}`
}

export function buildStateWithDefinitionRequest({
  baseBackendUrl,
  authToken,
  encryptionKey,
  lockTokenSecret,
  userId,
  sbi,
  grantCode,
  nowSeconds,
  iv
}) {
  const endpoint = new URL('/state/with-definition', required(baseBackendUrl, 'BASE_BACKEND_URL')).href
  const lockToken = mintReadLockToken({
    userId,
    sbi,
    grantCode,
    secret: lockTokenSecret,
    nowSeconds
  })

  return {
    url: endpoint,
    options: {
      method: 'POST',
      headers: {
        Authorization: createBackendAuthorizationHeader({
          authToken,
          encryptionKey,
          iv
        }),
        'Content-Type': 'application/json',
        'X-Application-Lock-Owner': lockToken
      },
      body: JSON.stringify({
        sbi,
        grantCode,
        includeDefinition: true
      })
    }
  }
}

export function hasBackendFormDefinition(body) {
  return Boolean(
    body &&
    typeof body === 'object' &&
    body.definition &&
    typeof body.definition === 'object' &&
    body.definition.definition &&
    typeof body.definition.definition === 'object'
  )
}

function getDefinitionVersion(body) {
  const definition = body?.definition
  const versionParts = [definition?.major, definition?.minor, definition?.patch]

  if (versionParts.every((part) => Number.isInteger(part))) {
    return versionParts.join('.')
  }

  return undefined
}

function truncateBody(body) {
  if (!body) {
    return ''
  }

  return body.length > 2000 ? `${body.slice(0, 2000)}...` : body
}

function requestHttp(url, options) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'https:' ? https : http
    const requestBody = options.body ?? ''
    const requestOptions = {
      method: options.method,
      headers: {
        ...options.headers,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }

    if (parsedUrl.protocol === 'https:') {
      requestOptions.rejectUnauthorized = false
    }

    const request = client.request(parsedUrl, requestOptions, (response) => {
      const chunks = []

      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8')
        const status = response.statusCode ?? 0

        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: async () => responseBody
        })
      })
    })

    request.on('error', reject)
    request.write(requestBody)
    request.end()
  })
}

export function readConfigFromEnv(env = process.env) {
  return {
    baseBackendUrl: env.BASE_BACKEND_URL ?? env.GRANTS_UI_BACKEND_URL ?? DEFAULT_BASE_BACKEND_URL,
    authToken: env.GRANTS_UI_BACKEND_AUTH_TOKEN ?? DEFAULT_AUTH_TOKEN,
    encryptionKey: env.GRANTS_UI_BACKEND_ENCRYPTION_KEY ?? DEFAULT_ENCRYPTION_KEY,
    lockTokenSecret: env.APPLICATION_LOCK_TOKEN_SECRET ?? DEFAULT_LOCK_TOKEN_SECRET,
    grantCode: env.READINESS_GRANT_CODE ?? DEFAULT_GRANT_CODE,
    userId: env.READINESS_USER_ID ?? env.READINESS_CRN ?? DEFAULT_USER_ID,
    sbi: env.READINESS_SBI ?? DEFAULT_SBI
  }
}

export async function probeBackendFormDefinition(config, requestImpl = requestHttp) {
  const request = buildStateWithDefinitionRequest(config)
  let response

  try {
    response = await requestImpl(request.url, request.options)
  } catch (error) {
    return {
      ok: false,
      message: `Backend definition readiness request failed: ${error.message}`
    }
  }

  const responseBody = await response.text()
  let body

  try {
    body = responseBody ? JSON.parse(responseBody) : null
  } catch {
    return {
      ok: false,
      message: `Backend definition readiness returned non-JSON response: ${truncateBody(responseBody)}`
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      message: `Backend definition readiness returned HTTP ${response.status}: ${truncateBody(responseBody)}`
    }
  }

  if (!hasBackendFormDefinition(body)) {
    return {
      ok: false,
      message: `Backend definition readiness response did not include a nested form definition: ${truncateBody(responseBody)}`
    }
  }

  const version = getDefinitionVersion(body)

  return {
    ok: true,
    message: `${config.grantCode} backend definition is ready${version ? ` at version ${version}` : ''}`
  }
}

async function main() {
  const result = await probeBackendFormDefinition(readConfigFromEnv())

  if (result.ok) {
    process.stdout.write(`${result.message}\n`)
    return
  }

  process.stderr.write(`${result.message}\n`)
  process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
