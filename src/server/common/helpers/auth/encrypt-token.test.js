import crypto from 'node:crypto'
import { vi } from 'vitest'

const SECRET = 'test-encryption-secret'

function decryptToken(encryptedToken, secret) {
  const [iv, authTag, encrypted] = encryptedToken.split(':').map((part) => Buffer.from(part, 'base64'))
  const key = crypto.scryptSync(secret, 'salt', 32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

describe('encryptToken', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('derives a key once for repeated calls, including different tokens', async () => {
    const { encryptToken } = await import('./encrypt-token.js')
    const scrypt = vi.spyOn(crypto, 'scryptSync')

    const first = encryptToken('first-token', SECRET)
    const second = encryptToken('second-token', SECRET)

    expect(scrypt).toHaveBeenCalledExactlyOnceWith(SECRET, 'salt', 32)
    expect(decryptToken(first, SECRET)).toBe('first-token')
    expect(decryptToken(second, SECRET)).toBe('second-token')
  })

  it('keeps separate derived keys for different secrets', async () => {
    const { encryptToken } = await import('./encrypt-token.js')
    const scrypt = vi.spyOn(crypto, 'scryptSync')
    const otherSecret = 'another-test-secret'

    const first = encryptToken('token', SECRET)
    const second = encryptToken('token', otherSecret)
    encryptToken('token', SECRET)

    expect(scrypt).toHaveBeenCalledTimes(2)
    expect(decryptToken(first, SECRET)).toBe('token')
    expect(decryptToken(second, otherSecret)).toBe('token')
  })

  it('uses a fresh IV for every encryption with a cached key', async () => {
    const { encryptToken } = await import('./encrypt-token.js')
    const first = encryptToken('token', SECRET)
    const second = encryptToken('token', SECRET)

    expect(first.split(':')[0]).not.toBe(second.split(':')[0])
    expect(decryptToken(first, SECRET)).toBe('token')
    expect(decryptToken(second, SECRET)).toBe('token')
  })

  it('retries derivation after a failure', async () => {
    const { encryptToken } = await import('./encrypt-token.js')
    const error = new Error('Key derivation failed')
    const scrypt = vi.spyOn(crypto, 'scryptSync').mockImplementationOnce(() => {
      throw error
    })

    expect(() => encryptToken('token', SECRET)).toThrow(error)
    const encrypted = encryptToken('token', SECRET)

    expect(scrypt).toHaveBeenCalledTimes(2)
    expect(decryptToken(encrypted, SECRET)).toBe('token')
  })
})
