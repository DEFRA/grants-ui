import { vi } from 'vitest'
import { config } from '~/src/config/config.js'

const mockGetToken = vi.fn()

vi.mock('@azure/identity', () => ({
  ClientAssertionCredential: vi.fn(() => ({ getToken: mockGetToken }))
}))

vi.mock('~/src/server/common/helpers/entra/cognito-token.js', () => ({
  getCognitoToken: vi.fn()
}))

const { clearTokenState, getValidToken } = await import('~/src/server/common/helpers/entra/token-manager.js')

describe('Token Manager', () => {
  beforeEach(() => {
    config.set('entra', {
      tokenEndpoint: 'https://login.microsoftonline.com',
      tenantId: 'mock-tenant-id',
      clientId: 'mock-client-id'
    })
    clearTokenState()
    vi.clearAllMocks()
  })

  describe('getValidToken', () => {
    test('returns access token from ClientAssertionCredential', async () => {
      mockGetToken.mockResolvedValueOnce({ token: 'mock-access-token' })

      const token = await getValidToken()

      expect(token).toBe('mock-access-token')
      expect(mockGetToken).toHaveBeenCalledWith('mock-client-id/.default')
    })

    test('creates ClientAssertionCredential with correct config', async () => {
      const { ClientAssertionCredential } = await import('@azure/identity')
      const { getCognitoToken } = await import('~/src/server/common/helpers/entra/cognito-token.js')

      mockGetToken.mockResolvedValueOnce({ token: 'mock-access-token' })

      await getValidToken()

      expect(ClientAssertionCredential).toHaveBeenCalledWith('mock-tenant-id', 'mock-client-id', getCognitoToken)
    })

    test('throws error when token retrieval fails', async () => {
      mockGetToken.mockRejectedValueOnce(new Error('Authentication failed'))

      await expect(getValidToken()).rejects.toThrow('Authentication failed')
    })
  })
})
