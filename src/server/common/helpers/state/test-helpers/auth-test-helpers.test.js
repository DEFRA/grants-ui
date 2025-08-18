import { jest } from '@jest/globals'
import {
  createExpectedAuthHeader,
  encryptTokenForTest,
  createMockConfig,
  createMockConfigWithoutEndpoint,
  createCustomMockConfig,
  MOCK_CONFIG_VALUES,
  CONFIG_KEYS,
  TEST_CONSTANTS
} from './auth-test-helpers.js'

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

describe('Config Mock Helpers', () => {
  describe('createMockConfig', () => {
    it('should return a mock config with all required properties', () => {
      const mockConfig = createMockConfig()

      expect(mockConfig).toHaveProperty('config')
      expect(mockConfig.config).toHaveProperty('get')
      expect(mockConfig.config.get).toEqual(expect.any(Function))
    })

    it('should return expected values for standard config keys', () => {
      const {
        config: { get }
      } = createMockConfig()

      expect(get(CONFIG_KEYS.API_ENDPOINT)).toBe(MOCK_CONFIG_VALUES.DEFAULT[CONFIG_KEYS.API_ENDPOINT])
      expect(get(CONFIG_KEYS.AUTH_TOKEN)).toBe(MOCK_CONFIG_VALUES.DEFAULT[CONFIG_KEYS.AUTH_TOKEN])
      expect(get(CONFIG_KEYS.ENCRYPTION_KEY)).toBe(MOCK_CONFIG_VALUES.DEFAULT[CONFIG_KEYS.ENCRYPTION_KEY])
      expect(get(CONFIG_KEYS.LOG)).toEqual(MOCK_CONFIG_VALUES.DEFAULT[CONFIG_KEYS.LOG])
      expect(get(CONFIG_KEYS.GIT_REPOSITORY_NAME)).toBe(MOCK_CONFIG_VALUES.DEFAULT[CONFIG_KEYS.GIT_REPOSITORY_NAME])
      expect(get(CONFIG_KEYS.SERVICE_VERSION)).toBe(MOCK_CONFIG_VALUES.DEFAULT[CONFIG_KEYS.SERVICE_VERSION])
    })

    it('should return null for unknown keys', () => {
      const {
        config: { get }
      } = createMockConfig()

      expect(get(TEST_CONSTANTS.UNKNOWN_KEY)).toBeNull()
    })
  })

  describe('createMockConfigWithoutEndpoint', () => {
    it('should return null for session.cache.apiEndpoint', () => {
      const {
        config: { get }
      } = createMockConfigWithoutEndpoint()

      expect(get(CONFIG_KEYS.API_ENDPOINT)).toBeNull()
    })

    it('should still return other config values', () => {
      const {
        config: { get }
      } = createMockConfigWithoutEndpoint()

      expect(get(CONFIG_KEYS.LOG)).toEqual(MOCK_CONFIG_VALUES.WITHOUT_ENDPOINT[CONFIG_KEYS.LOG])
      expect(get(CONFIG_KEYS.GIT_REPOSITORY_NAME)).toBe(
        MOCK_CONFIG_VALUES.WITHOUT_ENDPOINT[CONFIG_KEYS.GIT_REPOSITORY_NAME]
      )
      expect(get(CONFIG_KEYS.SERVICE_VERSION)).toBe(MOCK_CONFIG_VALUES.WITHOUT_ENDPOINT[CONFIG_KEYS.SERVICE_VERSION])
    })
  })

  describe('createCustomMockConfig', () => {
    it('should allow custom values to override defaults', () => {
      const customValues = {
        [CONFIG_KEYS.API_ENDPOINT]: TEST_CONSTANTS.CUSTOM_BACKEND_URL,
        [TEST_CONSTANTS.CUSTOM_KEY]: TEST_CONSTANTS.CUSTOM_VALUE
      }

      const {
        config: { get }
      } = createCustomMockConfig(customValues)

      expect(get(CONFIG_KEYS.API_ENDPOINT)).toBe(TEST_CONSTANTS.CUSTOM_BACKEND_URL)
      expect(get(TEST_CONSTANTS.CUSTOM_KEY)).toBe(TEST_CONSTANTS.CUSTOM_VALUE)
      expect(get(CONFIG_KEYS.AUTH_TOKEN)).toBe(MOCK_CONFIG_VALUES.DEFAULT[CONFIG_KEYS.AUTH_TOKEN]) // default preserved
    })

    it('should work with empty custom values', () => {
      const {
        config: { get }
      } = createCustomMockConfig({})

      expect(get(CONFIG_KEYS.API_ENDPOINT)).toBe(MOCK_CONFIG_VALUES.DEFAULT[CONFIG_KEYS.API_ENDPOINT])
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })
})
