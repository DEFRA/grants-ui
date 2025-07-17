import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { refreshTokens } from './refresh-tokens.js'

jest.mock('@hapi/wreck')
jest.mock('~/src/server/auth/get-oidc-config.js')
jest.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    AUTH: {
      TOKEN_VERIFICATION_SUCCESS: { level: 'info', messageFunc: jest.fn() },
      TOKEN_VERIFICATION_FAILURE: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))

describe('refreshTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    config.get = jest.fn((param) => {
      const configValues = {
        'defraId.clientId': 'test-client-id',
        'defraId.clientSecret': 'test-client-secret',
        'defraId.redirectUrl': 'https://test-redirect-url.com'
      }
      return configValues[param]
    })

    getOidcConfig.mockResolvedValue({
      token_endpoint: 'https://test-token-endpoint.com'
    })
  })

  it('should successfully refresh tokens', async () => {
    const mockPayload = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      id_token: 'new-id-token',
      expires_in: 3600
    }

    Wreck.post.mockResolvedValue({ payload: mockPayload })

    const result = await refreshTokens('old-refresh-token')

    expect(getOidcConfig).toHaveBeenCalledTimes(1)

    // Verify Wreck.post was called with the correct parameters
    const expectedUrl =
      'https://test-token-endpoint.com?client_id=test-client-id&client_secret=test-client-secret&grant_type=refresh_token&scope=openid offline_access test-client-id&refresh_token=old-refresh-token&redirect_uri=https://test-redirect-url.com'
    const expectedOptions = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      json: true
    }
    expect(Wreck.post).toHaveBeenCalledWith(expectedUrl, expectedOptions)

    expect(result).toEqual(mockPayload)
  })

  it('should throw an error when Wreck.post fails', async () => {
    const mockError = new Error('Network error')
    Wreck.post.mockRejectedValue(mockError)

    await expect(refreshTokens('old-refresh-token')).rejects.toThrow(
      'Network error'
    )

    expect(getOidcConfig).toHaveBeenCalledTimes(1)

    expect(config.get).toHaveBeenCalledWith('defraId.clientId')
  })

  it('should throw an error when getOidcConfig fails', async () => {
    const mockError = new Error('Configuration error')
    getOidcConfig.mockRejectedValue(mockError)

    await expect(refreshTokens('old-refresh-token')).rejects.toThrow(
      'Configuration error'
    )

    expect(Wreck.post).not.toHaveBeenCalled()
  })
})
