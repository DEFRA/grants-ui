import { vi } from 'vitest'
import { getAgreementController } from './controller.js'
import { config } from '~/src/config/config.js'
import Jwt from '@hapi/jwt'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { agreementsConfigValues } from '~/src/__mocks__/config-mocks.js'
import { log } from '~/src/server/common/helpers/logging/log.js'

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigSimple } = await import('~/src/__mocks__')
  return mockConfigSimple()
})

vi.mock('~/src/server/common/helpers/logging/log-codes.js', async () => {
  const { mockLogCodesHelper } = await import('~/src/__mocks__')
  return mockLogCodesHelper()
})

const BASE_URL = 'http://localhost:3003'
const CONFIG_ERROR = {
  error: 'Service Configuration Error',
  message: 'Service temporarily unavailable'
}
const UPSTREAM_ERROR = {
  error: 'External Service Unavailable',
  message: 'Unable to process request'
}
const expectedHeaders = (contentType = 'application/x-www-form-urlencoded') => ({
  Authorization: 'Bearer test-token',
  'x-base-url': '/agreement',
  'content-type': contentType,
  'x-encrypted-auth': 'mocked-jwt-token',
  'x-csp-nonce': 'test-nonce'
})

describe('Agreements Controller', () => {
  let mockRequest
  let mockH

  /** Resolve the mapUri callback the controller handed to h.proxy. */
  const mapUri = () => mockH.proxy.mock.calls[0][0].mapUri()

  /** The status code passed to h.response(...).code(...). */
  const responseCode = () => mockH.response.mock.results[0].value.code.mock.calls[0][0]

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset JWT mock to default behavior
    Jwt.token.generate.mockReturnValue('mocked-jwt-token')

    mockH = mockHapiResponseToolkit({
      proxy: vi.fn(),
      response: vi.fn(() => ({
        code: vi.fn(() => ({ code: vi.fn() }))
      }))
    })

    mockRequest = mockHapiRequest({
      headers: { 'x-request-id': 'test-request-id' },
      params: { path: 'test-path' },
      method: 'GET',
      auth: {
        isAuthenticated: true,
        credentials: {
          sbi: '106284736',
          crn: 'CRN123'
        }
      },
      app: {
        cspNonce: 'test-nonce'
      },
      yar: { get: vi.fn().mockReturnValue(null) }
    })

    config.get.mockImplementation(agreementsConfigValues())
  })

  describe('Configuration Validation', () => {
    test('should validate configuration successfully with valid values', async () => {
      await getAgreementController.handler(mockRequest, mockH)

      expect(config.get).toHaveBeenCalledWith('agreements.uiUrl')
      expect(config.get).toHaveBeenCalledWith('agreements.uiToken')
      expect(config.get).toHaveBeenCalledWith('agreements.jwtSecret')
      expect(mockH.proxy).toHaveBeenCalledWith({
        mapUri: expect.any(Function),
        passThrough: true,
        rejectUnauthorized: true
      })
    })

    test.each([
      ['API URL', 'agreements.uiUrl'],
      ['API token', 'agreements.uiToken']
    ])('should return 503 when the agreements %s is missing', async (_label, key) => {
      config.get.mockImplementation(agreementsConfigValues({ [key]: undefined }))

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.proxy).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith(CONFIG_ERROR)
      expect(responseCode()).toBe(503)
    })
  })

  describe('URI Building', () => {
    test.each([
      ['a plain path', 'api/v1/agreements', `${BASE_URL}/api/v1/agreements`],
      ['a path with a leading slash', '/api/v1/agreements', `${BASE_URL}/api/v1/agreements`],
      ['an empty path', '', BASE_URL],
      ['a null path', null, BASE_URL],
      ['an undefined path', undefined, BASE_URL],
      ['a very long path', `api/${'segment/'.repeat(50)}`, `${BASE_URL}/api/${'segment/'.repeat(50)}`],
      ['query parameters', 'agreements?filter=active&sort=date', `${BASE_URL}/agreements?filter=active&sort=date`],
      ['special characters', 'agreements/test%20path/item-123', `${BASE_URL}/agreements/test%20path/item-123`]
    ])('should build the target URI for %s', async (_label, path, expected) => {
      mockRequest.params.path = path

      await getAgreementController.handler(mockRequest, mockH)

      expect(mapUri().uri).toBe(expected)
    })

    test.each([
      ['no trailing slash', BASE_URL, `${BASE_URL}/api/v1/agreements`],
      ['one trailing slash', `${BASE_URL}/`, `${BASE_URL}/api/v1/agreements`],
      ['several trailing slashes', `${BASE_URL}///`, `${BASE_URL}///api/v1/agreements`]
    ])('should build the target URI when the base URL has %s', async (_label, uiUrl, expected) => {
      config.get.mockImplementation(agreementsConfigValues({ 'agreements.uiUrl': uiUrl }))
      mockRequest.params.path = 'api/v1/agreements'

      await getAgreementController.handler(mockRequest, mockH)

      expect(mapUri().uri).toBe(expected)
    })
  })

  describe('Header Building', () => {
    test.each([
      ['GET', undefined, 'application/x-www-form-urlencoded'],
      ['POST', undefined, 'application/x-www-form-urlencoded'],
      ['PUT', undefined, 'application/x-www-form-urlencoded'],
      ['PATCH', undefined, 'application/x-www-form-urlencoded'],
      ['GET', 'application/json', 'application/json'],
      ['POST', 'application/json', 'application/json']
    ])('should build proxy headers for %s with inbound content-type %s', async (method, inbound, expected) => {
      mockRequest.method = method
      if (inbound) {
        mockRequest.headers = { 'x-request-id': 'test-request-id', 'content-type': inbound }
      }

      await getAgreementController.handler(mockRequest, mockH)

      expect(mapUri().headers).toEqual(expectedHeaders(expected))
    })

    test('should use the first value when content-type arrives as an array', async () => {
      mockRequest.headers = { 'content-type': ['text/plain', 'application/json'] }

      await getAgreementController.handler(mockRequest, mockH)

      expect(mapUri().headers['content-type']).toBe('text/plain')
    })

    test('should handle JWT generation error and log failure', async () => {
      const jwtError = new Error('JWT secret invalid')
      jwtError.stack = 'Error: JWT secret invalid\n    at Object.generate'
      Jwt.token.generate.mockImplementationOnce(() => {
        throw jwtError
      })

      mockRequest.userId = 'test-user-123'

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith(expect.objectContaining(UPSTREAM_ERROR))
    })
  })

  describe('Request Handling', () => {
    test('should return successful proxy response directly', async () => {
      const mockProxyResponse = {
        statusCode: 200,
        payload: { agreements: [{ id: '123', name: 'Test Agreement' }] }
      }
      mockH.proxy.mockResolvedValue(mockProxyResponse)

      const result = await getAgreementController.handler(mockRequest, mockH)

      expect(result).toBe(mockProxyResponse)
      expect(mockH.response).not.toHaveBeenCalled()
    })

    test('should call proxy with correct parameters', async () => {
      mockRequest.params.path = 'test/endpoint'

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.proxy).toHaveBeenCalledWith({
        mapUri: expect.any(Function),
        passThrough: true,
        rejectUnauthorized: true
      })
      expect(mapUri().uri).toBe(`${BASE_URL}/test/endpoint`)
    })

    test('should return 502 when the upstream service returns no response', async () => {
      mockH.proxy.mockResolvedValue(undefined)

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'No response from upstream service',
        message: 'The agreements API did not return any data'
      })
      expect(responseCode()).toBe(502)
    })

    test.each([
      ['a bare error', {}, 503],
      ['an error carrying statusCode', { statusCode: 503 }, 503],
      ['an error carrying output.statusCode', { output: { statusCode: 502 } }, 502]
    ])('should surface %s with the right status code', async (_label, extra, expectedCode) => {
      const proxyError = Object.assign(new Error('Proxy connection failed'), extra)
      mockH.proxy.mockRejectedValue(proxyError)

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        ...UPSTREAM_ERROR,
        details: 'Proxy connection failed'
      })
      expect(responseCode()).toBe(expectedCode)
    })

    test('should log EXTERNAL_API_ERROR with service and upstreamStatus on proxy 5xx', async () => {
      const proxyError = new Error('Bad Gateway')
      proxyError.output = { statusCode: 502 }
      mockH.proxy.mockRejectedValue(proxyError)

      await getAgreementController.handler(mockRequest, mockH)

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error' }),
        expect.objectContaining({
          endpoint: 'agreements',
          service: 'farming-grants-agreements-ui',
          upstreamStatus: 502,
          errorMessage: 'Bad Gateway'
        }),
        mockRequest
      )
    })

    test('should not include error details in production', async () => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      mockH.proxy.mockRejectedValue(new Error('Internal details'))

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith(UPSTREAM_ERROR)

      process.env.NODE_ENV = originalNodeEnv
    })
  })
})
