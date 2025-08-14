import { createExpectedAuthHeader, encryptTokenForTest } from './auth-test-helpers.js'

describe('Auth Test Helpers', () => {
  describe('createExpectedAuthHeader', () => {
    const TEST_TOKEN = 'test-token-123'
    const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-chars-long'

    it('should create unencrypted Basic auth header when no encryption key provided', () => {
      const header = createExpectedAuthHeader(TEST_TOKEN)

      expect(header).toMatch(/^Basic [A-Za-z0-9+/]+=*$/)

      const base64Part = header.replace('Basic ', '')
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
      expect(decoded).toBe(`:${TEST_TOKEN}`)
    })

    it('should create encrypted Basic auth header when encryption key provided', () => {
      const header = createExpectedAuthHeader(TEST_TOKEN, TEST_ENCRYPTION_KEY)

      expect(header).toMatch(/^Basic [A-Za-z0-9+/]+=*$/)

      const base64Part = header.replace('Basic ', '')
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')

      expect(decoded).toMatch(/^:([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*)$/)
    })
  })

  describe('encryptTokenForTest', () => {
    const TEST_TOKEN = 'test-token-123'
    const TEST_ENCRYPTION_KEY = 'test-encryption-key-32-chars-long'

    it('should encrypt token with proper format', () => {
      const encrypted = encryptTokenForTest(TEST_TOKEN, TEST_ENCRYPTION_KEY)

      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/)

      const parts = encrypted.split(':')
      expect(parts).toHaveLength(3)
    })

    it('should throw error with invalid encryption key', () => {
      expect(() => {
        encryptTokenForTest(TEST_TOKEN, null)
      }).toThrow('Encryption key not configured')

      expect(() => {
        encryptTokenForTest(TEST_TOKEN, '')
      }).toThrow('Encryption key not configured')
    })
  })
})
