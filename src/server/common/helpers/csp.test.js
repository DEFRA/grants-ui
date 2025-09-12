import { describe, it, expect, vi, afterEach } from 'vitest'
import { contentSecurityPolicy } from './csp'

describe('contentSecurityPolicy', () => {
  const h = { continue: 'continue' } // Simulate Hapi lifecycle context object
  const mockHeader = vi.fn()

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should skip processing if the response is Boom', () => {
    const request = { response: { isBoom: true } }
    const result = contentSecurityPolicy(request, h)

    expect(result).toBe(h.continue) // Expect to return immediately without processing
    expect(mockHeader).not.toHaveBeenCalled() // Response headers should NOT be set
  })

  it('should set CSP headers and add nonce to response object', () => {
    const request = {
      response: {
        isBoom: false,
        header: mockHeader,
        app: {}, // Simulated app object
        variety: '' // Simulated response variety (non-view)
      }
    }

    const result = contentSecurityPolicy(request, h)
    expect(result).toBe(h.continue) // Function should still return the continue symbol

    expect(mockHeader).toHaveBeenCalledTimes(3) // Expect 3 headers to be set
    expect(mockHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.stringContaining("default-src 'self'"))
    expect(mockHeader).toHaveBeenNthCalledWith(2, 'Referrer-Policy', 'no-referrer')

    expect(request.response.app.cspNonce).toHaveLength(24) // Base64 encoded 16 bytes is 24 characters
    expect(mockHeader).toHaveBeenNthCalledWith(3, 'X-CSP-Nonce', request.response.app.cspNonce)
  })

  it('should handle response with view variety', () => {
    const request = {
      response: {
        isBoom: false,
        header: mockHeader,
        app: {},
        variety: 'view',
        source: {
          context: {}
        }
      }
    }

    contentSecurityPolicy(request, h)

    expect(request.response.source.context).toHaveProperty('cspNonce', request.response.app.cspNonce)
  })
})
