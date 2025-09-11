import { vi } from 'vitest'
import {
  createExpectedAuthHeader,
  encryptTokenForTest,
  createMockConfig,
  createMockConfigWithoutEndpoint,
  createCustomMockConfig,
  MOCK_CONFIG_VALUES,
  CONFIG_KEYS,
  TEST_CONSTANTS,
  TEST_BACKEND_URL,
  TEST_LOG_CONFIG,
  TEST_FOO_VALUE,
  TEST_USER_ID,
  TEST_ORGANISATION_ID,
  TEST_GRANT_SLUG,
  HTTP_STATUS_TEXT,
  ERROR_TEXT,
  MOCK_STATE_DATA,
  HTTP_STATUS,
  TEST_USER_IDS,
  ERROR_MESSAGES,
  LOG_MESSAGES
} from './auth-test-helpers.js'

describe('Exported Constants', () => {
  describe('Basic test constants', () => {
    it('should export correct TEST_BACKEND_URL', () => {
      expect(TEST_BACKEND_URL).toBe('https://test-backend')
    })

    it('should export correct user identifiers', () => {
      expect(TEST_USER_ID).toBe('user_test')
      expect(TEST_ORGANISATION_ID).toBe('biz_test')
      expect(TEST_GRANT_SLUG).toBe('test-slug')
    })
  })

  describe('TEST_LOG_CONFIG', () => {
    it('should have correct log configuration structure', () => {
      expect(TEST_LOG_CONFIG).toEqual({
        enabled: false,
        redact: [],
        level: 'info',
        format: 'ecs'
      })
    })
  })

  describe('HTTP_STATUS_TEXT', () => {
    it('should contain correct status text mappings', () => {
      expect(HTTP_STATUS_TEXT.NOT_FOUND).toBe('Not Found')
      expect(HTTP_STATUS_TEXT.INTERNAL_SERVER_ERROR).toBe('Internal Server Error')
    })
  })

  describe('ERROR_TEXT', () => {
    it('should contain all error text constants', () => {
      expect(ERROR_TEXT.NETWORK_ERROR).toBe('Network error')
      expect(ERROR_TEXT.NO_CONTENT).toBe('No content')
      expect(ERROR_TEXT.INVALID_URL).toBe('Invalid URL')
      expect(ERROR_TEXT.ENCRYPTION_NOT_CONFIGURED).toBe('Encryption key not configured')
    })
  })

  describe('CONFIG_KEYS', () => {
    it('should contain all configuration key mappings', () => {
      expect(CONFIG_KEYS.API_ENDPOINT).toBe('session.cache.apiEndpoint')
      expect(CONFIG_KEYS.AUTH_TOKEN).toBe('session.cache.authToken')
      expect(CONFIG_KEYS.ENCRYPTION_KEY).toBe('session.cache.encryptionKey')
      expect(CONFIG_KEYS.LOG).toBe('log')
      expect(CONFIG_KEYS.GIT_REPOSITORY_NAME).toBe('gitRepositoryName')
      expect(CONFIG_KEYS.SERVICE_VERSION).toBe('serviceVersion')
    })
  })

  describe('MOCK_STATE_DATA', () => {
    it('should contain correct state data structures', () => {
      expect(MOCK_STATE_DATA.DEFAULT).toEqual({ state: { foo: TEST_FOO_VALUE } })
      expect(MOCK_STATE_DATA.SIMPLE).toEqual({ foo: TEST_FOO_VALUE })
      expect(MOCK_STATE_DATA.WITH_STEP).toEqual({ foo: TEST_FOO_VALUE, step: 1 })
    })
  })

  describe('HTTP_STATUS', () => {
    it('should contain correct HTTP status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200)
      expect(HTTP_STATUS.NOT_FOUND).toBe(404)
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500)
    })
  })

  describe('TEST_USER_IDS', () => {
    it('should map to correct user identifier values', () => {
      expect(TEST_USER_IDS.DEFAULT).toBe(TEST_USER_ID)
      expect(TEST_USER_IDS.ORGANISATION_ID).toBe(TEST_ORGANISATION_ID)
      expect(TEST_USER_IDS.GRANT_ID).toBe(TEST_GRANT_SLUG)
    })
  })

  describe('ERROR_MESSAGES', () => {
    it('should map error messages correctly', () => {
      expect(ERROR_MESSAGES.NETWORK_ERROR).toBe(ERROR_TEXT.NETWORK_ERROR)
      expect(ERROR_MESSAGES.NO_CONTENT).toBe(ERROR_TEXT.NO_CONTENT)
      expect(ERROR_MESSAGES.NOT_FOUND).toBe(HTTP_STATUS_TEXT.NOT_FOUND)
      expect(ERROR_MESSAGES.INTERNAL_SERVER_ERROR).toBe(HTTP_STATUS_TEXT.INTERNAL_SERVER_ERROR)
      expect(ERROR_MESSAGES.INVALID_URL).toBe(ERROR_TEXT.INVALID_URL)
    })
  })

  describe('LOG_MESSAGES', () => {
    it('should contain all log message constants', () => {
      expect(LOG_MESSAGES.UNEXPECTED_STATE_FORMAT).toBe('Unexpected or empty state format')
      expect(LOG_MESSAGES.FETCH_FAILED).toBe('Failed to fetch saved state from API')
      expect(LOG_MESSAGES.PERSIST_FAILED).toBe('Failed to persist state to API')
    })
  })
})

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

    it('should merge custom values properly with spread operator', () => {
      const customValues = {
        [CONFIG_KEYS.API_ENDPOINT]: null,
        newKey: 'newValue'
      }

      const {
        config: { get }
      } = createCustomMockConfig(customValues)

      expect(get(CONFIG_KEYS.API_ENDPOINT)).toBeNull()
      expect(get('newKey')).toBe('newValue')
      expect(get(CONFIG_KEYS.AUTH_TOKEN)).toBe(MOCK_CONFIG_VALUES.DEFAULT[CONFIG_KEYS.AUTH_TOKEN])
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })
})
