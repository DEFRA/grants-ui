import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest'
import { contentSecurityPolicy as plugin } from '~/src/plugins/content-security-policy.js'

const mockError = vi.fn()
const mockGetIdentityProviderOrigin = vi.fn()

vi.mock('~/src/server/auth/get-identity-provider-origin.js', () => ({
  getIdentityProviderOrigin: (...args) => mockGetIdentityProviderOrigin(...args)
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  debug: vi.fn(),
  error: (...args) => mockError(...args),
  LogCodes: {
    SYSTEM: {
      CSP_SFD_UPDATE_URL_INVALID: { level: 'error', messageFunc: () => 'invalid sfd url' },
      CSP_IDENTITY_PROVIDER_ORIGIN_INVALID: { level: 'error', messageFunc: () => 'invalid identity provider origin' }
    }
  }
}))

const mockConfigGet = vi.fn()
vi.mock('~/src/config/config.js', () => ({
  config: { get: (/** @type {string} */ key) => mockConfigGet(key) }
}))

describe('contentSecurityPolicy plugin', () => {
  const mockHeader = vi.fn()
  const h = { continue: Symbol('continue') }
  let fakeServer
  let onRequest
  let onPreResponse

  beforeEach(async () => {
    mockGetIdentityProviderOrigin.mockResolvedValue('https://identity.example.com')
    mockConfigGet.mockImplementation((key) => {
      switch (key) {
        case 'isProduction':
          return false
        case 'externalLinks.sfd.enabled':
          return false
        case 'externalLinks.sfd.updateUrl':
          return ''
        default:
          return undefined
      }
    })

    onRequest = null
    onPreResponse = null
    fakeServer = {
      ext: vi.fn((event, fn) => {
        switch (event) {
          case 'onRequest':
            onRequest = fn
            break
          case 'onPreResponse':
            onPreResponse = fn
            break
        }
      })
    }

    await plugin.register(fakeServer)
  })

  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  const enableSfd = (/** @type {string} */ updateUrl) =>
    mockConfigGet.mockImplementation((key) => {
      if (key === 'externalLinks.sfd.enabled') {
        return true
      }
      if (key === 'externalLinks.sfd.updateUrl') {
        return updateUrl
      }
      return false
    })

  async function getCspHeader() {
    const request = { response: { isBoom: false, header: mockHeader, variety: '' }, app: {} }
    await onRequest(request, h)
    await onPreResponse(request, h)
    return mockHeader.mock.calls.find(([name]) => name === 'Content-Security-Policy')?.[1]
  }

  describe('onRequest handler', () => {
    test('registers an onRequest handler', () => {
      // ensure ext was called with onRequest
      expect(fakeServer.ext).toHaveBeenCalled()
      const call = fakeServer.ext.mock.calls.find(([ev]) => ev === 'onRequest')
      expect(call).toBeTruthy()
      const [, handler] = call
      expect(typeof handler).toBe('function')
    })

    test('sets a base64 nonce on request.app.cspNonce and continues', async () => {
      const request = { app: {} }

      const result = await onRequest(request, h)

      expect(request.app.cspNonce).toMatch(/^[A-Za-z0-9+/=]+$/)
      expect(request.app.cspNonce.length).toBe(24)
      expect(result).toBe(h.continue)
    })

    test('generates a fresh nonce per request', async () => {
      const req1 = { app: {} }
      await onRequest(req1, h)
      const nonce1 = req1.app.cspNonce

      const req2 = { app: {} }
      await onRequest(req2, h)
      const nonce2 = req2.app.cspNonce

      expect(nonce1).toBeDefined()
      expect(nonce2).toBeDefined()
      expect(nonce1).not.toEqual(nonce2)
    })
  })

  describe('onPreResponse handler', () => {
    it('should skip processing if the response is Boom', async () => {
      const request = { response: { isBoom: true, header: mockHeader }, app: {} }
      await onRequest(request, h)
      const result = await onPreResponse(request, h)

      expect(result).toBe(h.continue) // Expect to return immediately without processing
      expect(mockHeader).toHaveBeenCalledWith('Content-Security-Policy', "default-src 'none'") // Response headers should NOT be set
    })

    it('should set CSP headers and add nonce to response object', async () => {
      const request = {
        response: {
          isBoom: false,
          header: mockHeader,
          variety: ''
        },
        app: {}
      }

      await onRequest(request, h)
      const result = await onPreResponse(request, h)
      expect(result).toBe(h.continue)

      expect(mockHeader).toHaveBeenCalledTimes(3)
      expect(mockHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.stringContaining("default-src 'self'"))
      expect(mockHeader).toHaveBeenNthCalledWith(2, 'Referrer-Policy', 'no-referrer')

      expect(request.app.cspNonce).toHaveLength(24) // Base64 encoded 16 bytes is 24 characters
      expect(mockHeader).toHaveBeenNthCalledWith(3, 'X-CSP-Nonce', request.app.cspNonce)
    })

    it('allows CartoCDN for the parcel map basemap-provider toggle', async () => {
      const request = {
        response: {
          isBoom: false,
          header: mockHeader,
          variety: ''
        },
        app: {}
      }

      await onRequest(request, h)
      await onPreResponse(request, h)

      const [, policy] = mockHeader.mock.calls.find(([name]) => name === 'Content-Security-Policy')
      expect(policy).toContain('https://basemaps.cartocdn.com')
      expect(policy).toContain('https://*.basemaps.cartocdn.com')
    })

    it.each([
      { initialContext: {}, description: 'empty context object' },
      { initialContext: undefined, description: 'undefined context' },
      { initialContext: { existingProp: 'value' }, description: 'context with existing properties' }
    ])('should add cspNonce to view response with $description', async ({ initialContext }) => {
      const request = {
        response: {
          isBoom: false,
          header: mockHeader,
          variety: 'view',
          source: {
            context: initialContext
          }
        },
        app: {}
      }

      await onRequest(request, h)
      await onPreResponse(request, h)

      expect(request.response.source.context).toHaveProperty('cspNonce', request.app.cspNonce)
      if (initialContext?.existingProp) {
        expect(request.response.source.context).toHaveProperty('existingProp', 'value')
      }
    })

    it('should include GOV.UK Frontend SHA-256 hash in script-src', async () => {
      const cspHeader = await getCspHeader()
      expect(cspHeader).toContain("'sha256-GUQ5ad8JK5KmEWmROf3LZd9ge94daqNvd8xy9YS1iDw='")
    })

    it('should include form-action self directive', async () => {
      const cspHeader = await getCspHeader()
      expect(cspHeader).toContain("form-action 'self'")
    })

    it('should allowlist the SFD origin in form-action when SFD is enabled', async () => {
      enableSfd('https://sfd.example.com/update-sbi')

      const cspHeader = await getCspHeader()
      expect(cspHeader).toContain("form-action 'self' https://sfd.example.com https://identity.example.com")
      // origin only — query/path stripped so ?ssoOrgId=... redirects still match
      expect(cspHeader).not.toContain('update-sbi')
    })

    it('omits and logs an unavailable identity provider origin when SFD is enabled', async () => {
      mockGetIdentityProviderOrigin.mockResolvedValueOnce(null)
      await plugin.register(fakeServer)
      enableSfd('https://sfd.example.com/update-sbi')

      const cspHeader = await getCspHeader()

      expect(cspHeader).toContain("form-action 'self' https://sfd.example.com;")
      expect(mockError).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' }),
        expect.objectContaining({ identityProviderOrigin: null })
      )
    })

    it('should keep form-action self when SFD is enabled but URL is malformed', async () => {
      enableSfd('not a url')

      const cspHeader = await getCspHeader()
      expect(cspHeader).toContain("form-action 'self';")
      expect(mockError).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' }),
        expect.objectContaining({ sfdUpdateUrl: 'not a url' })
      )
    })

    it('should keep form-action self when SFD is enabled but no URL is set', async () => {
      enableSfd('')

      const cspHeader = await getCspHeader()
      expect(cspHeader).toContain("form-action 'self';")
    })

    it('should include GTM wildcard in script-src', async () => {
      const cspHeader = await getCspHeader()
      expect(cspHeader).toContain('https://*.googletagmanager.com')
    })
  })

  describe('Nonce integrity', () => {
    it('should ensure nonce is consistent between onRequest and onPreResponse', async () => {
      const request = {
        response: {
          isBoom: false,
          header: mockHeader
        },
        app: {}
      }

      await onRequest(request, h)
      const onRequestNonce = `${request.app.cspNonce}`
      expect(request.app.cspNonce).toHaveLength(24)

      await onPreResponse(request, h)
      expect(onRequestNonce).equal(request.app.cspNonce)
    })
  })
})
