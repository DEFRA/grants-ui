import { describe, expect, it } from 'vitest'
import { cookiesController, cookiesPostController } from './cookies.controller.js'

const createMockRequest = (overrides = {}) => ({
  query: {},
  headers: {},
  state: {},
  logger: {
    info: () => {}
  },
  ...overrides
})

const createMockH = () => {
  const unstateCalls = []
  return {
    view: (template, context) => {
      const response = { template, context, stateCalls: [] }
      response.state = (name, value, options) => {
        response.stateCalls.push({ name, value, options })
        return response
      }
      return response
    },
    redirect: (url) => {
      const response = { redirectUrl: url, stateCalls: [] }
      response.state = (name, value, options) => {
        response.stateCalls.push({ name, value, options })
        return response
      }
      return response
    },
    response: (body) => {
      const response = { body, stateCalls: [] }
      response.state = (name, value, options) => {
        response.stateCalls.push({ name, value, options })
        return response
      }
      return response
    },
    unstate: (name) => {
      unstateCalls.push(name)
    },
    getUnstateCalls: () => unstateCalls
  }
}

describe('cookies.controller', () => {
  describe('cookiesController', () => {
    it.each([
      { referer: '/previous-page', expectedReferrer: '/', description: 'with referer header (ignored)' },
      { referer: undefined, expectedReferrer: '/', description: 'without referer header' }
    ])('should render the cookies page $description', async ({ referer, expectedReferrer }) => {
      const mockRequest = createMockRequest({
        headers: referer ? { referer } : {}
      })
      const mockH = createMockH()

      const result = await cookiesController.handler(mockRequest, mockH)

      expect(result.template).toBe('cookies')
      expect(result.context.pageTitle).toBe('Cookies')
      expect(result.context.heading).toBe('Cookies')
      expect(result.context.referrer).toBe(expectedReferrer)
    })

    it.each([
      { returnUrl: 123, expectedReferrer: '/', description: 'numeric returnUrl' },
      { returnUrl: null, expectedReferrer: '/', description: 'null returnUrl' }
    ])('should default to "/" for invalid returnUrl: $description', async ({ returnUrl, expectedReferrer }) => {
      const mockRequest = createMockRequest({
        query: { returnUrl }
      })
      const mockH = createMockH()
      const result = await cookiesController.handler(mockRequest, mockH)

      expect(result.context.referrer).toBe(expectedReferrer)
    })
  })

  describe('cookiesPostController', () => {
    it.each([
      {
        payload: { analytics: true, returnUrl: '/previous-page' },
        expected: '/previous-page',
        description: 'valid returnUrl from payload'
      },
      { payload: { analytics: true }, expected: null, description: 'no returnUrl provided — re-renders page' },
      {
        payload: { analytics: true, returnUrl: 'https://evil.com' },
        expected: null,
        description: 'absolute URL (security) — re-renders page'
      },
      {
        payload: { analytics: true, returnUrl: '/page?param=value' },
        expected: '/page?param=value',
        description: 'relative URL with query params'
      },
      { payload: null, expected: null, description: 'null payload — re-renders page' },
      {
        payload: { analytics: true, returnUrl: '/cookies?returnUrl=/some-page' },
        expected: '/cookies?returnUrl=/some-page',
        description: 'returnUrl starting with /cookies redirects there'
      }
    ])('should redirect to "$expected" when $description', async ({ payload, expected }) => {
      const mockRequest = createMockRequest({ payload })
      const mockH = createMockH()

      const result = await cookiesPostController.handler(mockRequest, mockH)

      if (expected) {
        expect(result).toHaveProperty('redirectUrl', expected)
      } else {
        expect(result).toHaveProperty('template', 'cookies')
      }
    })

    it.each([
      { analytics: true, expectedConsentValue: 'true' },
      { analytics: false, expectedConsentValue: 'false' }
    ])(
      'should set consent cookie to "$expectedConsentValue" when analytics is $analytics',
      async ({ analytics, expectedConsentValue }) => {
        const mockRequest = createMockRequest({ payload: { analytics, returnUrl: '/' } })
        const result = await cookiesPostController.handler(mockRequest, createMockH())
        expect(result.stateCalls[0].value).toBe(expectedConsentValue)
      }
    )

    it('should return JSON {message: success} in async mode', async () => {
      const mockRequest = createMockRequest({ payload: { analytics: true, async: true } })
      const result = await cookiesPostController.handler(mockRequest, createMockH())
      expect(result.body).toEqual({ message: 'success' })
    })

    it('should call h.unstate for GA cookies when analytics is rejected', async () => {
      const mockRequest = createMockRequest({
        payload: { analytics: false, returnUrl: '/' },
        state: { _ga: 'GA1.2.123', _ga_ABC: 'GS1.1', _gid: 'GA1.2.456', session: 'abc' }
      })
      const mockH = createMockH()
      await cookiesPostController.handler(mockRequest, mockH)
      const unstated = mockH.getUnstateCalls()
      expect(unstated).toContain('_ga')
      expect(unstated).toContain('_ga_ABC')
      expect(unstated).toContain('_gid')
      expect(unstated).not.toContain('session')
    })

    it('should not call h.unstate when analytics is accepted', async () => {
      const mockRequest = createMockRequest({
        payload: { analytics: true, returnUrl: '/' },
        state: { _ga: 'GA1.2.123' }
      })
      const mockH = createMockH()
      await cookiesPostController.handler(mockRequest, mockH)
      expect(mockH.getUnstateCalls()).toHaveLength(0)
    })
  })
})
