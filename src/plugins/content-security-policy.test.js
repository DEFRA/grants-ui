import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest'
import { contentSecurityPolicy as plugin } from '~/src/plugins/content-security-policy.js'

const mockError = vi.fn()
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  debug: vi.fn(),
  error: (...args) => mockError(...args),
  LogCodes: {
    SYSTEM: {
      CSP_SFD_UPDATE_URL_INVALID: { level: 'error', messageFunc: () => 'invalid sfd url' }
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

    it('omits CartoCDN from the CSP on a normal (non-devMode) response', async () => {
      const request = { response: { isBoom: false, header: mockHeader, variety: '' }, app: {} }

      await onRequest(request, h)
      await onPreResponse(request, h)

      const [, policy] = mockHeader.mock.calls.find(([name]) => name === 'Content-Security-Policy')
      expect(policy).not.toContain('cartocdn.com')
    })

    it('allows CartoCDN only on a devMode map view', async () => {
      const request = {
        response: {
          isBoom: false,
          header: mockHeader,
          variety: 'view',
          source: { context: { devMode: true } }
        },
        app: {}
      }

      await onRequest(request, h)
      await onPreResponse(request, h)

      const [, policy] = mockHeader.mock.calls.find(([name]) => name === 'Content-Security-Policy')
      expect(policy).toContain('https://basemaps.cartocdn.com')
      expect(policy).toContain('https://*.basemaps.cartocdn.com')
    })

    it('omits CartoCDN on a normal (non-devMode) view render', async () => {
      const request = {
        response: {
          isBoom: false,
          header: mockHeader,
          variety: 'view',
          source: { context: { devMode: false } }
        },
        app: {}
      }

      await onRequest(request, h)
      await onPreResponse(request, h)

      const [, policy] = mockHeader.mock.calls.find(([name]) => name === 'Content-Security-Policy')
      expect(policy).not.toContain('cartocdn.com')
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

    it.each([
      "'sha256-GUQ5ad8JK5KmEWmROf3LZd9ge94daqNvd8xy9YS1iDw='",
      "form-action 'self'",
      'https://*.googletagmanager.com'
    ])('includes %s in the CSP', async (fragment) => {
      expect(await getCspHeader()).toContain(fragment)
    })

    it('should allowlist the SFD origin in form-action when SFD is enabled', async () => {
      enableSfd('https://sfd.example.com/update-sbi')

      const cspHeader = await getCspHeader()
      expect(cspHeader).toContain("form-action 'self' https://sfd.example.com")
      // origin only — query/path stripped so ?ssoOrgId=... redirects still match
      expect(cspHeader).not.toContain('update-sbi')
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
