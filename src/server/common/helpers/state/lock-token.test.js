import { describe, it, expect, beforeEach, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { config } from '~/src/config/config.js'
import { mintLockToken } from './lock-token.js'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

describe('mintLockToken', () => {
  const SECRET = 'test-lock-token-secret'

  const baseParams = {
    userId: 'contact-123',
    grantCode: 'GRANT_XYZ'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    config.get.mockReturnValue(SECRET)
  })

  it('returns a signed JWT string', () => {
    const token = mintLockToken(baseParams)

    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3) // header.payload.signature
  })

  it('includes required lock claims in payload', () => {
    const token = mintLockToken(baseParams)

    const decoded = jwt.verify(token, SECRET)

    expect(decoded).toMatchObject({
      sub: baseParams.userId,
      grantCode: baseParams.grantCode,
      typ: 'lock',
      iss: 'grants-ui',
      aud: 'grants-backend'
    })
  })

  it('sets a short-lived expiry (5 minutes)', () => {
    const now = Math.floor(Date.now() / 1000)

    const token = mintLockToken(baseParams)
    const decoded = jwt.verify(token, SECRET)

    expect(decoded.exp).toBeGreaterThan(now)
    expect(decoded.exp).toBeLessThanOrEqual(now + 5 * 60)
  })

  it('fails verification with an invalid secret', () => {
    const token = mintLockToken(baseParams)

    expect(() => {
      jwt.verify(token, 'wrong-secret')
    }).toThrow()
  })

  it('uses the configured lockToken secret', () => {
    mintLockToken(baseParams)

    expect(config.get).toHaveBeenCalledWith('lockToken.secret')
  })
})
