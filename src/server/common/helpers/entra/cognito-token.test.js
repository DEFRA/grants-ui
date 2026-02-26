import { vi } from 'vitest'
import { config } from '~/src/config/config.js'

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-cognito-identity', () => ({
  CognitoIdentityClient: vi.fn(() => ({ send: mockSend })),
  GetOpenIdTokenForDeveloperIdentityCommand: vi.fn((input) => ({ input }))
}))

const { getCognitoToken } = await import('~/src/server/common/helpers/entra/cognito-token.js')

describe('getCognitoToken', () => {
  beforeEach(() => {
    config.set('cognito', {
      identityPoolId: 'eu-west-2:test-pool-id',
      loginKey: 'grants-ui-aad-access',
      loginValue: 'grants-ui'
    })
    vi.clearAllMocks()
  })

  test('returns token from Cognito API', async () => {
    mockSend.mockResolvedValueOnce({ Token: 'mock-cognito-token' })

    const token = await getCognitoToken()

    expect(token).toBe('mock-cognito-token')
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  test('passes correct identity pool ID and logins', async () => {
    const { GetOpenIdTokenForDeveloperIdentityCommand } = await import(
      '@aws-sdk/client-cognito-identity'
    )

    mockSend.mockResolvedValueOnce({ Token: 'mock-cognito-token' })

    await getCognitoToken()

    expect(GetOpenIdTokenForDeveloperIdentityCommand).toHaveBeenCalledWith({
      IdentityPoolId: 'eu-west-2:test-pool-id',
      Logins: {
        'grants-ui-aad-access': 'grants-ui'
      }
    })
  })

  test('throws error when Cognito returns no token', async () => {
    mockSend.mockResolvedValueOnce({ Token: undefined })

    await expect(getCognitoToken()).rejects.toThrow('Cognito response did not contain a token')
  })

  test('throws error when Cognito API call fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('Network error'))

    await expect(getCognitoToken()).rejects.toThrow('Network error')
  })
})
