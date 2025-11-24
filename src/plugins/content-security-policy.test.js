import { describe, test, beforeEach, afterEach, expect, vi, it } from 'vitest'
import { contentSecurityPolicy as plugin } from '~/src/plugins/content-security-policy.js'

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({}))

describe('contentSecurityPolicy plugin', () => {
  const mockHeader = vi.fn()
  const h = { continue: Symbol('continue') }
  let fakeServer
  let onRequest
  let onPreResponse

  beforeEach(async () => {
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

    it('should handle response with view variety', async () => {
      const request = {
        response: {
          isBoom: false,
          header: mockHeader,
          variety: 'view',
          source: {
            context: {}
          }
        },
        app: {}
      }

      await onRequest(request, h)
      await onPreResponse(request, h)

      expect(request.response.source.context).toHaveProperty('cspNonce', request.app.cspNonce)
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
