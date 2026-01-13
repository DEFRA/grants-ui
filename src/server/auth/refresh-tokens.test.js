import { vi } from 'vitest'
import Wreck from '@hapi/wreck'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { refreshTokens } from './refresh-tokens.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { mockSimpleRequest } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('~/src/server/auth/get-oidc-config.js')

describe('refreshTokens', () => {
  let mockRequest

  beforeEach(() => {
    vi.clearAllMocks()

    mockRequest = mockSimpleRequest()

    config.get = vi.fn((param) => {
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

    const result = await refreshTokens('old-refresh-token', mockRequest)

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

    await expect(refreshTokens('old-refresh-token', mockRequest)).rejects.toThrow('Network error')

    expect(getOidcConfig).toHaveBeenCalledTimes(1)

    expect(config.get).toHaveBeenCalledWith('defraId.clientId')
  })

  it('should throw an error when getOidcConfig fails', async () => {
    const mockError = new Error('Configuration error')
    getOidcConfig.mockRejectedValue(mockError)

    await expect(refreshTokens('old-refresh-token', mockRequest)).rejects.toThrow('Configuration error')

    expect(Wreck.post).not.toHaveBeenCalled()
  })

  it('should error when no access token is returned', async () => {
    Wreck.post.mockResolvedValue({ payload: {} })
    await expect(refreshTokens('refresh-token', mockRequest)).rejects.toThrow('No access token in refresh response')
  })

  describe('refreshTokens - error scenarios', () => {
    test.each([
      {
        errorMessage: 'OIDC',
        stepValue: 'oidc_config_fetch'
      },
      {
        errorMessage: 'ENOTFOUND',
        stepValue: 'token_endpoint_connection'
      },
      {
        errorMessage: '400',
        stepValue: 'token_endpoint_auth'
      },
      {
        errorMessage: 'access_token',
        stepValue: 'token_refresh_response_validation'
      }
    ])(
      'Should log the correct step when an error occurs containing "$errorMessage"',
      async ({ errorMessage, stepValue }) => {
        const mockError = new Error(errorMessage)
        getOidcConfig.mockRejectedValue(mockError)

        await expect(refreshTokens('refresh-token', mockRequest)).rejects.toThrow(errorMessage)

        expect(log).toHaveBeenCalledTimes(1)
        expect(log).toHaveBeenCalledWith(
          expect.any(Object),
          expect.objectContaining({
            step: stepValue
          }),
          mockRequest
        )
      }
    )

    it('should log the step when an unknown error occurs', async () => {
      const mockError = new Error('not in list')
      getOidcConfig.mockRejectedValue(mockError)

      await expect(refreshTokens('refresh-token', mockRequest)).rejects.toThrow('not in list')

      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          step: 'unknown'
        }),
        mockRequest
      )
    })

    it('should log the step when an unknown error occurs and statusCode is set', async () => {
      const mockError = new Error('not in list')
      mockError.statusCode = 500

      getOidcConfig.mockRejectedValue(mockError)

      await expect(refreshTokens('refresh-token', mockRequest)).rejects.toThrow('not in list')

      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          step: 'token_endpoint_response'
        }),
        mockRequest
      )
    })
  })
})
