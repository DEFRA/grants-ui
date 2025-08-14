import { jest } from '@jest/globals'

const TEST_ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-32-chars'
const CONTENT_TYPE_JSON = 'application/json'

const HEADER_OBJECTS = {
  CONTENT_TYPE_JSON: { 'Content-Type': CONTENT_TYPE_JSON },
  EMPTY: {}
}

const CONFIG_SESSION_CACHE_AUTH_TOKEN = 'session.cache.authToken'
const CONFIG_SESSION_CACHE_ENCRYPTION_KEY = 'session.cache.encryptionKey'

const MOCK_TOKENS = {
  DEFAULT: 'test-token-123',
  API: 'api-test-token',
  ALTERNATIVE: 'test-token-456',
  THIRD: 'test-token-789',
  MUTATION_TEST: 'test-token-mutation',
  SECRET: 'my-secret-token'
}

const TEST_HEADERS = {
  USER_AGENT: 'test-agent',
  CUSTOM_VALUE: 'custom-value'
}

const mockConfig = {
  get: jest.fn()
}

jest.mock('~/src/config/config.js', () => ({
  config: mockConfig
}))

async function importBackendAuthHelper() {
  return await import('./backend-auth-helper.js')
}

function setupMockConfig(value, encryptionKey = TEST_ENCRYPTION_KEY) {
  mockConfig.get.mockImplementation((key) => {
    if (key === CONFIG_SESSION_CACHE_AUTH_TOKEN) return value
    if (key === CONFIG_SESSION_CACHE_ENCRYPTION_KEY) return encryptionKey
    return null
  })
}

describe('Backend Auth Helper', () => {
  beforeEach(() => {
    jest.resetModules()
    mockConfig.get.mockClear()
  })

  describe('createAuthenticatedHeaders', () => {
    describe('when no token is configured', () => {
      it('should return base headers when no token is configured', async () => {
        setupMockConfig('', TEST_ENCRYPTION_KEY)

        const { createAuthenticatedHeaders } = await importBackendAuthHelper()
        const headers = createAuthenticatedHeaders(HEADER_OBJECTS.CONTENT_TYPE_JSON)

        expect(mockConfig.get).toHaveBeenCalledWith(CONFIG_SESSION_CACHE_AUTH_TOKEN)
        expect(headers).toEqual(HEADER_OBJECTS.CONTENT_TYPE_JSON)
        expect(headers.Authorization).toBeUndefined()
      })
    })

    describe('when token is configured', () => {
      it('should add Authorization header when token is configured', async () => {
        setupMockConfig(MOCK_TOKENS.DEFAULT)

        const { createAuthenticatedHeaders } = await importBackendAuthHelper()
        const headers = createAuthenticatedHeaders(HEADER_OBJECTS.CONTENT_TYPE_JSON)

        expect(mockConfig.get).toHaveBeenCalledWith(CONFIG_SESSION_CACHE_AUTH_TOKEN)
        expect(headers).toHaveProperty('Content-Type', 'application/json')
        expect(headers).toHaveProperty('Authorization')
        expect(headers.Authorization).toMatch(/^Basic [A-Za-z0-9+/]+=*$/)

        const base64Part = headers.Authorization.replace('Basic ', '')
        const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
        expect(decoded).toMatch(/^:([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*)$/)
      })

      it('should work with empty base headers', async () => {
        setupMockConfig(MOCK_TOKENS.ALTERNATIVE)

        const { createAuthenticatedHeaders } = await importBackendAuthHelper()
        const headers = createAuthenticatedHeaders(undefined)

        expect(mockConfig.get).toHaveBeenCalledWith(CONFIG_SESSION_CACHE_AUTH_TOKEN)
        expect(headers).toHaveProperty('Authorization')
        expect(headers.Authorization).toMatch(/^Basic [A-Za-z0-9+/]+=*$/)

        const base64Part = headers.Authorization.replace('Basic ', '')
        const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
        expect(decoded).toMatch(/^:([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*)$/)
      })

      it('should preserve all base headers when adding auth', async () => {
        const baseHeaders = {
          'Content-Type': CONTENT_TYPE_JSON,
          'User-Agent': TEST_HEADERS.USER_AGENT,
          'X-Custom-Header': TEST_HEADERS.CUSTOM_VALUE
        }

        setupMockConfig(MOCK_TOKENS.THIRD)

        const { createAuthenticatedHeaders } = await importBackendAuthHelper()
        const headers = createAuthenticatedHeaders(baseHeaders)

        expect(mockConfig.get).toHaveBeenCalledWith(CONFIG_SESSION_CACHE_AUTH_TOKEN)
        expect(headers).toHaveProperty('Content-Type', CONTENT_TYPE_JSON)
        expect(headers).toHaveProperty('User-Agent', TEST_HEADERS.USER_AGENT)
        expect(headers).toHaveProperty('X-Custom-Header', TEST_HEADERS.CUSTOM_VALUE)
        expect(headers).toHaveProperty('Authorization')
        expect(headers.Authorization).toMatch(/^Basic [A-Za-z0-9+/]+=*$/)

        const base64Part = headers.Authorization.replace('Basic ', '')
        const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
        expect(decoded).toMatch(/^:([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*)$/)
      })
    })

    it('should not mutate original base headers object', async () => {
      const baseHeaders = HEADER_OBJECTS.CONTENT_TYPE_JSON

      setupMockConfig(MOCK_TOKENS.MUTATION_TEST)

      const { createAuthenticatedHeaders } = await importBackendAuthHelper()
      const headers = createAuthenticatedHeaders(baseHeaders)

      expect(baseHeaders).toEqual(HEADER_OBJECTS.CONTENT_TYPE_JSON)
      expect(baseHeaders.Authorization).toBeUndefined()
      expect(headers.Authorization).toBeDefined()
    })

    it('should handle null token correctly', async () => {
      setupMockConfig(null, TEST_ENCRYPTION_KEY)

      const { createAuthenticatedHeaders } = await importBackendAuthHelper()
      const headers = createAuthenticatedHeaders({ 'Content-Type': CONTENT_TYPE_JSON })

      expect(headers).toEqual(HEADER_OBJECTS.CONTENT_TYPE_JSON)
      expect(headers.Authorization).toBeUndefined()
    })
  })

  describe('createApiHeaders', () => {
    it('should return headers with Content-Type and no auth when no token configured', async () => {
      setupMockConfig('', TEST_ENCRYPTION_KEY)

      const { createApiHeaders } = await importBackendAuthHelper()
      const headers = createApiHeaders()

      expect(headers).toEqual(HEADER_OBJECTS.CONTENT_TYPE_JSON)
    })

    it('should return headers with Content-Type and Authorization when token configured', async () => {
      setupMockConfig(MOCK_TOKENS.API)

      const { createApiHeaders } = await importBackendAuthHelper()
      const headers = createApiHeaders()

      expect(headers).toHaveProperty('Content-Type', 'application/json')
      expect(headers).toHaveProperty('Authorization')
      expect(headers.Authorization).toMatch(/^Basic [A-Za-z0-9+/]+=*$/)

      const base64Part = headers.Authorization.replace('Basic ', '')
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
      expect(decoded).toMatch(/^:([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*)$/)
    })
  })

  describe('Base64 encoding', () => {
    it('should encode encrypted token with blank username correctly', async () => {
      setupMockConfig(MOCK_TOKENS.SECRET)

      const { createAuthenticatedHeaders } = await importBackendAuthHelper()
      const headers = createAuthenticatedHeaders()
      const authHeader = headers.Authorization

      const base64Part = authHeader.replace('Basic ', '')
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')

      expect(decoded).toMatch(/^:([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*):([A-Za-z0-9+/]+=*)$/)
    })
  })

  describe('Token Encryption', () => {
    beforeEach(() => {
      jest.resetModules()
      mockConfig.get.mockClear()
    })

    it('should encrypt token when encryption key is configured', async () => {
      mockConfig.get.mockImplementation((key) => {
        if (key === CONFIG_SESSION_CACHE_AUTH_TOKEN) return MOCK_TOKENS.DEFAULT
        if (key === CONFIG_SESSION_CACHE_ENCRYPTION_KEY) return TEST_ENCRYPTION_KEY
        return null
      })

      const { createAuthenticatedHeaders } = await importBackendAuthHelper()
      const headers = createAuthenticatedHeaders(HEADER_OBJECTS.CONTENT_TYPE_JSON)

      expect(mockConfig.get).toHaveBeenCalledWith(CONFIG_SESSION_CACHE_AUTH_TOKEN)
      expect(mockConfig.get).toHaveBeenCalledWith(CONFIG_SESSION_CACHE_ENCRYPTION_KEY)
      expect(headers.Authorization).toBeDefined()
      expect(headers.Authorization).toMatch(/^Basic /)

      const base64Part = headers.Authorization.replace('Basic ', '')
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8')
      const tokenPart = decoded.substring(1)

      expect(tokenPart).toMatch(/^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/)
    })

    it('should throw error when no encryption key is configured', async () => {
      mockConfig.get.mockImplementation((key) => {
        if (key === CONFIG_SESSION_CACHE_AUTH_TOKEN) return MOCK_TOKENS.DEFAULT
        if (key === CONFIG_SESSION_CACHE_ENCRYPTION_KEY) return ''
        return null
      })

      const { createAuthenticatedHeaders } = await importBackendAuthHelper()

      expect(() => {
        createAuthenticatedHeaders(HEADER_OBJECTS.CONTENT_TYPE_JSON)
      }).toThrow('Encryption key is required for secure token transmission')
    })

    it('should throw error when encryption key is null', async () => {
      mockConfig.get.mockImplementation((key) => {
        if (key === CONFIG_SESSION_CACHE_AUTH_TOKEN) return MOCK_TOKENS.DEFAULT
        if (key === CONFIG_SESSION_CACHE_ENCRYPTION_KEY) return null
        return null
      })

      const { createAuthenticatedHeaders } = await importBackendAuthHelper()

      expect(() => {
        createAuthenticatedHeaders(HEADER_OBJECTS.CONTENT_TYPE_JSON)
      }).toThrow('Encryption key is required for secure token transmission')
    })

    it('should throw error when encryptToken is called without encryption key', async () => {
      jest.resetModules()

      mockConfig.get.mockImplementation((key) => {
        if (key === CONFIG_SESSION_CACHE_AUTH_TOKEN) return MOCK_TOKENS.DEFAULT
        if (key === CONFIG_SESSION_CACHE_ENCRYPTION_KEY) return null
        return null
      })

      const { encryptToken } = await importBackendAuthHelper()

      expect(() => {
        encryptToken(MOCK_TOKENS.DEFAULT)
      }).toThrow('Encryption key not configured')
    })
  })
})
