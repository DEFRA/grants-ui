import { vi } from 'vitest'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { getSignOutRequest, toSignOutUrl } from '~/src/server/auth/get-sign-out-url.js'
import { createState } from '~/src/server/auth/state.js'

vi.mock('~/src/config/config.js')
vi.mock('~/src/server/auth/get-oidc-config.js')
vi.mock('~/src/server/auth/state.js')
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  debug: vi.fn()
}))

describe('getSignOutRequest / toSignOutUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    getOidcConfig.mockResolvedValue({
      end_session_endpoint: 'https://auth.example.com/logout'
    })

    config.get.mockReturnValue('https://grants-ui.example.com/signed-out')

    createState.mockReturnValue('mock-state-value')
  })

  it('should return correctly formatted sign-out URL', async () => {
    const mockRequest = { session: {} }
    const mockToken = 'mock-id-token'

    const result = toSignOutUrl(await getSignOutRequest(mockRequest, mockToken))

    expect(getOidcConfig).toHaveBeenCalledTimes(1)
    expect(config.get).toHaveBeenCalledWith('defraId.signOutRedirectUrl')
    expect(createState).toHaveBeenCalledWith(mockRequest)

    const expectedUrl =
      'https://auth.example.com/logout?post_logout_redirect_uri=https://grants-ui.example.com/signed-out&id_token_hint=mock-id-token&state=mock-state-value'
    expect(result).toBe(expectedUrl)
  })

  it('should handle special characters in redirect URL correctly', async () => {
    const mockRequest = { session: {} }
    const mockToken = 'mock-id-token'
    config.get.mockReturnValue('https://grants-ui.example.com/signed-out?param=value&special=true')

    const result = toSignOutUrl(await getSignOutRequest(mockRequest, mockToken))

    expect(result).toMatch(
      /post_logout_redirect_uri=https:\/\/grants-ui\.example\.com\/signed-out\?param=value&special=true/
    )
  })

  it('should create state using the provided request object', async () => {
    const mockRequest = { session: { customData: 'test' } }
    const mockToken = 'mock-id-token'

    toSignOutUrl(await getSignOutRequest(mockRequest, mockToken))

    expect(createState).toHaveBeenCalledWith(mockRequest)
  })

  it('exposes the endpoint and fields for the POST form of the request', async () => {
    const mockRequest = { session: {} }

    const result = await getSignOutRequest(mockRequest, 'mock-id-token')

    expect(createState).toHaveBeenCalledWith(mockRequest)
    expect(result).toEqual({
      endpoint: 'https://auth.example.com/logout',
      fields: {
        post_logout_redirect_uri: 'https://grants-ui.example.com/signed-out',
        id_token_hint: 'mock-id-token',
        state: 'mock-state-value'
      }
    })
  })

  it('should handle empty token correctly', async () => {
    const mockRequest = { session: {} }
    const mockToken = ''

    const result = toSignOutUrl(await getSignOutRequest(mockRequest, mockToken))

    expect(result).toContain('id_token_hint=')
  })

  it('should fetch OIDC config and throws if unavailable', async () => {
    const mockRequest = { session: {} }
    const mockToken = 'mock-id-token'
    getOidcConfig.mockRejectedValue(new Error('Failed to fetch OIDC config'))

    await expect(getSignOutRequest(mockRequest, mockToken)).rejects.toThrow('Failed to fetch OIDC config')
  })

  it('should handle different end_session_endpoint values', async () => {
    const mockRequest = { session: {} }
    const mockToken = 'mock-id-token'
    getOidcConfig.mockResolvedValue({
      end_session_endpoint: 'https://different-auth.example.org/end-session'
    })

    const result = toSignOutUrl(await getSignOutRequest(mockRequest, mockToken))

    expect(result).toContain('https://different-auth.example.org/end-session')
  })
})
