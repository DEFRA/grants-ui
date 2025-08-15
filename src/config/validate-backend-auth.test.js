import { jest } from '@jest/globals'
import { validateBackendAuthConfig } from './validate-backend-auth.js'

const CONFIG_SESSION_CACHE_API_ENDPOINT = 'session.cache.apiEndpoint'
const CONFIG_SESSION_CACHE_AUTH_TOKEN = 'session.cache.authToken'
const CONFIG_SESSION_CACHE_ENCRYPTION_KEY = 'session.cache.encryptionKey'

const MOCK_TOKENS = {
  DEFAULT: 'test-token-123',
  ALTERNATIVE: 'test-token-456'
}

const TEST_ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-32-chars'
const TEST_BACKEND_URL = 'http://localhost:3001'

describe('validateBackendAuthConfig', () => {
  let mockConfig

  beforeEach(() => {
    mockConfig = {
      get: jest.fn()
    }
  })

  it('should pass when no backend URL is configured', () => {
    const configValues = {
      [CONFIG_SESSION_CACHE_API_ENDPOINT]: '',
      [CONFIG_SESSION_CACHE_AUTH_TOKEN]: MOCK_TOKENS.DEFAULT,
      [CONFIG_SESSION_CACHE_ENCRYPTION_KEY]: TEST_ENCRYPTION_KEY
    }

    mockConfig.get.mockImplementation((key) => configValues[key] || null)

    expect(() => validateBackendAuthConfig(mockConfig)).not.toThrow()
  })

  it('should pass when backend URL is null', () => {
    const configValues = {
      [CONFIG_SESSION_CACHE_API_ENDPOINT]: null,
      [CONFIG_SESSION_CACHE_AUTH_TOKEN]: MOCK_TOKENS.DEFAULT,
      [CONFIG_SESSION_CACHE_ENCRYPTION_KEY]: TEST_ENCRYPTION_KEY
    }

    mockConfig.get.mockImplementation((key) => configValues[key] || null)

    expect(() => validateBackendAuthConfig(mockConfig)).not.toThrow()
  })

  it('should pass when backend URL and all credentials are configured', () => {
    const configValues = {
      [CONFIG_SESSION_CACHE_API_ENDPOINT]: TEST_BACKEND_URL,
      [CONFIG_SESSION_CACHE_AUTH_TOKEN]: MOCK_TOKENS.DEFAULT,
      [CONFIG_SESSION_CACHE_ENCRYPTION_KEY]: TEST_ENCRYPTION_KEY
    }

    mockConfig.get.mockImplementation((key) => configValues[key] || null)

    expect(() => validateBackendAuthConfig(mockConfig)).not.toThrow()
  })

  it('should throw when backend URL is set but auth token is missing', () => {
    const configValues = {
      [CONFIG_SESSION_CACHE_API_ENDPOINT]: TEST_BACKEND_URL,
      [CONFIG_SESSION_CACHE_AUTH_TOKEN]: '',
      [CONFIG_SESSION_CACHE_ENCRYPTION_KEY]: TEST_ENCRYPTION_KEY
    }

    mockConfig.get.mockImplementation((key) => configValues[key] || null)

    expect(() => validateBackendAuthConfig(mockConfig)).toThrow(
      'Backend authentication configuration incomplete. When GRANTS_UI_BACKEND_URL is set, the following environment variables are required: GRANTS_UI_BACKEND_AUTH_TOKEN'
    )
  })

  it('should throw when backend URL is set but encryption key is missing', () => {
    const configValues = {
      [CONFIG_SESSION_CACHE_API_ENDPOINT]: TEST_BACKEND_URL,
      [CONFIG_SESSION_CACHE_AUTH_TOKEN]: MOCK_TOKENS.DEFAULT,
      [CONFIG_SESSION_CACHE_ENCRYPTION_KEY]: ''
    }

    mockConfig.get.mockImplementation((key) => configValues[key] || null)

    expect(() => validateBackendAuthConfig(mockConfig)).toThrow(
      'Backend authentication configuration incomplete. When GRANTS_UI_BACKEND_URL is set, the following environment variables are required: GRANTS_UI_BACKEND_ENCRYPTION_KEY'
    )
  })

  it('should handle null credentials same as empty strings', () => {
    const configValues = {
      [CONFIG_SESSION_CACHE_API_ENDPOINT]: TEST_BACKEND_URL,
      [CONFIG_SESSION_CACHE_AUTH_TOKEN]: null,
      [CONFIG_SESSION_CACHE_ENCRYPTION_KEY]: null
    }

    mockConfig.get.mockImplementation((key) => configValues[key])

    expect(() => validateBackendAuthConfig(mockConfig)).toThrow(
      'Backend authentication configuration incomplete. When GRANTS_UI_BACKEND_URL is set, the following environment variables are required: GRANTS_UI_BACKEND_AUTH_TOKEN, GRANTS_UI_BACKEND_ENCRYPTION_KEY'
    )
  })
})
