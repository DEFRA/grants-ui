import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  buildStateWithDefinitionRequest,
  createBackendAuthorizationHeader,
  hasBackendFormDefinition,
  mintReadLockToken,
  readConfigFromEnv
} from '../tools/check-backend-form-definition-ready.js'

function decryptAuthorizationHeader(header, encryptionKey) {
  const credentials = Buffer.from(header.replace('Bearer ', ''), 'base64').toString('utf8')
  const [iv, authTag, encrypted] = credentials.split(':')
  const key = crypto.scryptSync(encryptionKey, 'salt', 32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))

  decipher.setAuthTag(Buffer.from(authTag, 'base64'))

  let decrypted = decipher.update(encrypted, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function decodeJwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
}

describe('backend form definition readiness probe', () => {
  it('creates the encrypted backend authorization header expected by grants-ui-backend', () => {
    const header = createBackendAuthorizationHeader({
      authToken: 'auth_token',
      encryptionKey: 'encryption_key',
      iv: Buffer.alloc(12, 1)
    })

    expect(header).toMatch(/^Bearer /)
    expect(decryptAuthorizationHeader(header, 'encryption_key')).toBe('auth_token')
  })

  it('mints a read lock token without a grantVersion claim', () => {
    const token = mintReadLockToken({
      userId: '1103823647',
      sbi: '106700730',
      grantCode: 'example-grant-with-auth',
      secret: 'dev-lock-secret',
      nowSeconds: 1234567890
    })

    expect(decodeJwtPayload(token)).toEqual({
      sub: '1103823647',
      sbi: '106700730',
      grantCode: 'example-grant-with-auth',
      typ: 'lock',
      iat: 1234567890,
      aud: 'grants-backend',
      iss: 'grants-ui'
    })
  })

  it('builds a state-with-definition request that mirrors the app read path', () => {
    const request = buildStateWithDefinitionRequest({
      baseBackendUrl: 'http://localhost:3001',
      authToken: 'auth_token',
      encryptionKey: 'encryption_key',
      lockTokenSecret: 'dev-lock-secret',
      userId: '1103823647',
      sbi: '106700730',
      grantCode: 'example-grant-with-auth',
      nowSeconds: 1234567890,
      iv: Buffer.alloc(12, 1)
    })

    expect(request.url).toBe('http://localhost:3001/state/with-definition')
    expect(request.options).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sbi: '106700730',
        grantCode: 'example-grant-with-auth',
        includeDefinition: true
      })
    })
    expect(request.options.headers.Authorization).toMatch(/^Bearer /)
    expect(decodeJwtPayload(request.options.headers['X-Application-Lock-Owner'])).not.toHaveProperty('grantVersion')
  })

  it('defaults to the proxied backend endpoint used by the HA smoke stack', () => {
    expect(readConfigFromEnv({})).toMatchObject({
      baseBackendUrl: 'https://localhost:4001',
      authToken: 'auth_token',
      encryptionKey: 'encryption_key',
      lockTokenSecret: 'dev-lock-secret',
      grantCode: 'example-grant-with-auth',
      userId: '1100957269',
      sbi: '107593059'
    })
  })

  it('only treats the backend as ready when the nested form definition is present', () => {
    expect(
      hasBackendFormDefinition({
        state: null,
        definition: {
          grantCode: 'example-grant-with-auth',
          major: 1,
          minor: 0,
          patch: 1,
          definition: {
            pages: []
          }
        }
      })
    ).toBe(true)

    expect(
      hasBackendFormDefinition({
        state: null,
        definition: {
          grantCode: 'example-grant-with-auth',
          major: 1,
          minor: 0,
          patch: 1
        }
      })
    ).toBe(false)
  })
})
