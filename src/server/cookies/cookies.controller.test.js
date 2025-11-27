import { describe, expect, it } from 'vitest'
import { cookiesController, cookiesPostController } from './cookies.controller.js'

const createMockRequest = (overrides = {}) => ({
  query: {},
  headers: {},
  logger: {
    info: () => {}
  },
  ...overrides
})

const createMockH = () => ({
  view: (template, context) => ({ template, context }),
  redirect: (url) => {
    const response = { redirectUrl: url }
    response.state = () => response
    return response
  }
})

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  logger: {},
  LogCodes: {}
}))

describe('cookies.controller', () => {
  describe('cookiesController', () => {
    it.each([
      { referer: '/previous-page', expectedReferrer: '/previous-page', description: 'with referer header' },
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
        payload: { returnUrl: '/previous-page' },
        expected: '/previous-page',
        description: 'valid returnUrl from payload'
      },
      { payload: {}, expected: '/', description: 'no returnUrl provided' },
      { payload: { returnUrl: 'https://evil.com' }, expected: '/', description: 'absolute URL (security)' },
      {
        payload: { returnUrl: '/page?param=value' },
        expected: '/page?param=value',
        description: 'relative URL with query params'
      },
      { payload: null, expected: '/', description: 'null payload' }
    ])('should redirect to "$expected" when $description', ({ payload, expected }) => {
      const mockRequest = createMockRequest({ payload })
      const mockH = createMockH()

      const result = cookiesPostController.handler(mockRequest, mockH)

      expect(result).toHaveProperty('redirectUrl', expected)
    })
  })
})
