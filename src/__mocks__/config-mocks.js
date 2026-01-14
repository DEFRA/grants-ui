import { vi } from 'vitest'

export const mockLandGrantsConfig = () => ({
  config: {
    get: vi.fn((key) => {
      const values = {
        'landGrants.grantCode': 'TEST-GRANT-CODE',
        'devTools.enabled': false
      }
      return values[key]
    })
  }
})

export const mockConfig = (configValues = {}) => ({
  config: {
    get: vi.fn((key) => configValues[key])
  }
})

export const mockConfigSimple = () => ({
  config: {
    get: vi.fn()
  }
})

export const createMockConfig = (baseValues = {}) => {
  let configValues = { ...baseValues }

  const configMock = {
    config: {
      get: vi.fn((key) => configValues[key])
    },
    withAuth: (authValues = {}) => {
      configValues = {
        ...configValues,
        'session.cache.authToken': 'test-auth-token-123',
        'session.cache.encryptionKey': 'test-encryption-key-32-chars-long',
        'auth.azureClientId': 'test-client-id',
        'auth.azureClientSecret': 'test-client-secret',
        'auth.azureTenantId': 'test-tenant-id',
        ...authValues
      }
      return configMock
    },
    withBackend: (backendValues = {}) => {
      configValues = {
        ...configValues,
        'session.cache.apiEndpoint': 'http://localhost:3001',
        'session.cache.authToken': 'backend-auth-token',
        'session.cache.encryptionKey': 'backend-encryption-key-32-chars',
        'landGrants.grantCode': 'LAND001',
        ...backendValues
      }
      return configMock
    }
  }

  return configMock
}
