import { getAgreementController } from './controller.js'
import { config } from '~/src/config/config.js'
import Jwt from '@hapi/jwt'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

jest.mock('~/src/config/config.js', () => ({
  config: {
    get: jest.fn()
  }
}))

jest.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn()
  }))
}))

jest.mock('~/src/server/sbi/state.js', () => ({
  sbiStore: {
    get: jest.fn(() => 'test-sbi-value')
  }
}))

jest.mock('@hapi/jwt', () => ({
  token: {
    generate: jest.fn(() => 'mocked-jwt-token')
  }
}))

jest.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: jest.fn()
}))

jest.mock('~/src/server/common/helpers/logging/log-codes.js', () => ({
  LogCodes: {
    AGREEMENTS: {
      AGREEMENT_ERROR: 'AGREEMENTS_AGREEMENT_ERROR'
    }
  }
}))

describe('Agreements Controller', () => {
  let mockRequest
  let mockH
  let mockProxy

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset JWT mock to default behavior
    Jwt.token.generate.mockReturnValue('mocked-jwt-token')

    mockProxy = jest.fn()
    mockH = {
      proxy: mockProxy,
      response: jest.fn(() => ({
        code: jest.fn(() => ({ code: jest.fn() }))
      }))
    }

    mockRequest = {
      headers: { 'x-request-id': 'test-request-id' },
      params: { path: 'test-path' },
      method: 'GET',
      logger: {
        info: jest.fn(),
        error: jest.fn()
      }
    }

    // Default config setup
    config.get.mockImplementation((key) => {
      switch (key) {
        case 'agreements.apiUrl':
          return 'http://localhost:3003'
        case 'agreements.apiToken':
          return 'test-token'
        case 'agreements.baseUrl':
          return '/agreement'
        case 'agreements.jwtSecret':
          return 'test-jwt-secret'
        default:
          return undefined
      }
    })
  })

  describe('Configuration Validation', () => {
    test('should validate configuration successfully with valid values', async () => {
      await getAgreementController.handler(mockRequest, mockH)

      expect(config.get).toHaveBeenCalledWith('agreements.apiUrl')
      expect(config.get).toHaveBeenCalledWith('agreements.apiToken')
      expect(config.get).toHaveBeenCalledWith('agreements.jwtSecret')
      expect(mockH.proxy).toHaveBeenCalledWith({
        mapUri: expect.any(Function),
        passThrough: true,
        rejectUnauthorized: false
      })
    })

    test('should return 503 when agreements API URL is missing', async () => {
      config.get.mockImplementation((key) => {
        switch (key) {
          case 'agreements.apiUrl':
            return undefined
          case 'agreements.apiToken':
            return 'test-token'
          case 'agreements.jwtSecret':
            return 'test-jwt-secret'
          default:
            return undefined
        }
      })

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.proxy).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Service Configuration Error',
        message: 'Service temporarily unavailable'
      })
    })

    test('should return 503 when agreements API token is missing', async () => {
      config.get.mockImplementation((key) => {
        switch (key) {
          case 'agreements.apiUrl':
            return 'http://localhost:3003'
          case 'agreements.apiToken':
            return undefined
          default:
            return undefined
        }
      })

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.proxy).not.toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Service Configuration Error',
        message: 'Service temporarily unavailable'
      })
    })

    test('should handle baseUrl with trailing slashes', async () => {
      config.get.mockImplementation((key) => {
        switch (key) {
          case 'agreements.apiUrl':
            return 'http://localhost:3003///'
          case 'agreements.apiToken':
            return 'test-token'
          case 'agreements.jwtSecret':
            return 'test-jwt-secret'
          default:
            return undefined
        }
      })

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.proxy).toHaveBeenCalledWith({
        mapUri: expect.any(Function),
        passThrough: true,
        rejectUnauthorized: false
      })
    })
  })

  describe('URI Building', () => {
    test('should build target URI correctly with path', async () => {
      mockRequest.params.path = 'api/v1/agreements'

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.uri).toBe('http://localhost:3003/api/v1/agreements')
    })

    test('should build target URI correctly with path starting with slash', async () => {
      mockRequest.params.path = '/api/v1/agreements'

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.uri).toBe('http://localhost:3003/api/v1/agreements')
    })

    test('should handle empty path', async () => {
      mockRequest.params.path = ''

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Path parameter is required'
      })
    })

    test('should build target URI correctly with base URL having trailing slash', async () => {
      config.get.mockImplementation((key) => {
        switch (key) {
          case 'agreements.apiUrl':
            return 'http://localhost:3003/'
          case 'agreements.apiToken':
            return 'test-token'
          case 'agreements.jwtSecret':
            return 'test-jwt-secret'
          default:
            return undefined
        }
      })
      mockRequest.params.path = 'api/v1/agreements'

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.uri).toBe('http://localhost:3003/api/v1/agreements')
    })
  })

  describe('Header Building', () => {
    test('should build proxy headers for GET request', async () => {
      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.headers).toEqual({
        Authorization: 'Bearer test-token',
        'content-type': 'application/x-www-form-urlencoded',
        'x-base-url': '/agreement',
        'x-encrypted-auth': 'mocked-jwt-token'
      })
      expect(Jwt.token.generate).toHaveBeenCalledWith({ sbi: 'test-sbi-value', source: 'defra' }, 'test-jwt-secret')
    })

    test('should build proxy headers for POST request with default content-type', async () => {
      mockRequest.method = 'POST'

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.headers).toEqual({
        Authorization: 'Bearer test-token',
        'x-base-url': '/agreement',
        'content-type': 'application/x-www-form-urlencoded',
        'x-encrypted-auth': 'mocked-jwt-token'
      })
    })

    test('should build proxy headers for POST request with custom content-type', async () => {
      mockRequest.method = 'POST'
      mockRequest.headers = {
        'x-request-id': 'test-request-id',
        'content-type': 'application/json'
      }

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.headers).toEqual({
        Authorization: 'Bearer test-token',
        'x-base-url': '/agreement',
        'content-type': 'application/json',
        'x-encrypted-auth': 'mocked-jwt-token'
      })
    })

    test('should build proxy headers for PUT request', async () => {
      mockRequest.method = 'PUT'

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.headers).toEqual({
        Authorization: 'Bearer test-token',
        'x-base-url': '/agreement',
        'content-type': 'application/x-www-form-urlencoded',
        'x-encrypted-auth': 'mocked-jwt-token'
      })
    })

    test('should build proxy headers for PATCH request', async () => {
      mockRequest.method = 'PATCH'

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.headers).toEqual({
        Authorization: 'Bearer test-token',
        'x-base-url': '/agreement',
        'content-type': 'application/x-www-form-urlencoded',
        'x-encrypted-auth': 'mocked-jwt-token'
      })
    })

    test('should preserve content-type for GET request when provided', async () => {
      mockRequest.headers = {
        'x-request-id': 'test-request-id',
        'content-type': 'application/json'
      }

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.headers).toEqual({
        Authorization: 'Bearer test-token',
        'x-base-url': '/agreement',
        'content-type': 'application/json',
        'x-encrypted-auth': 'mocked-jwt-token'
      })
    })

    test('should handle JWT generation error and log failure', async () => {
      const jwtError = new Error('JWT secret invalid')
      jwtError.stack = 'Error: JWT secret invalid\n    at Object.generate'
      Jwt.token.generate.mockImplementationOnce(() => {
        throw jwtError
      })

      mockRequest.userId = 'test-user-123'

      await getAgreementController.handler(mockRequest, mockH)

      expect(log).toHaveBeenCalledWith(LogCodes.AGREEMENTS.AGREEMENT_ERROR, {
        userId: 'test-user-123',
        error: 'JWT generate failed: JWT secret invalid'
      })

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'External Service Unavailable',
        message: 'Unable to process request',
        details: 'Failed to generate JWT token: JWT secret invalid'
      })
    })
  })

  describe('Request Handling', () => {
    test('should return 400 when path parameter is missing', async () => {
      mockRequest.params.path = null

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Path parameter is required'
      })
      expect(mockH.proxy).not.toHaveBeenCalled()
    })

    test('should return 400 when path parameter is undefined', async () => {
      mockRequest.params.path = undefined

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Path parameter is required'
      })
      expect(mockH.proxy).not.toHaveBeenCalled()
    })

    test('should call proxy with correct parameters', async () => {
      mockRequest.params.path = 'test/endpoint'

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.proxy).toHaveBeenCalledWith({
        mapUri: expect.any(Function),
        passThrough: true,
        rejectUnauthorized: false
      })

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.uri).toBe('http://localhost:3003/test/endpoint')
      expect(mapUriResult.headers).toEqual({
        Authorization: 'Bearer test-token',
        'x-base-url': '/agreement',
        'content-type': 'application/x-www-form-urlencoded',
        'x-encrypted-auth': 'mocked-jwt-token'
      })
    })

    test('should handle proxy errors gracefully', async () => {
      const proxyError = new Error('Proxy connection failed')
      mockH.proxy.mockRejectedValue(proxyError)

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'External Service Unavailable',
        message: 'Unable to process request',
        details: 'Proxy connection failed'
      })
    })

    test('should handle proxy errors with status code', async () => {
      const proxyError = new Error('Service unavailable')
      proxyError.statusCode = 503
      mockH.proxy.mockRejectedValue(proxyError)

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'External Service Unavailable',
        message: 'Unable to process request',
        details: 'Service unavailable'
      })
    })

    test('should use unknown requestId when header is missing', async () => {
      delete mockRequest.headers['x-request-id']
      const proxyError = new Error('Test error')
      mockH.proxy.mockRejectedValue(proxyError)

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'External Service Unavailable',
        message: 'Unable to process request',
        details: 'Test error'
      })
    })

    test('should return proper status code for different error types', async () => {
      const proxyError = new Error('Bad Gateway')
      proxyError.output = { statusCode: 502 }
      mockH.proxy.mockRejectedValue(proxyError)

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'External Service Unavailable',
        message: 'Unable to process request',
        details: 'Bad Gateway'
      })
    })

    test('should not include error details in production', async () => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const proxyError = new Error('Internal details')
      mockH.proxy.mockRejectedValue(proxyError)

      await getAgreementController.handler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith({
        error: 'External Service Unavailable',
        message: 'Unable to process request'
      })

      process.env.NODE_ENV = originalNodeEnv
    })
  })

  describe('Edge Cases', () => {
    test('should handle very long paths', async () => {
      const longPath = 'api/v1/agreements/' + 'segment/'.repeat(50)
      mockRequest.params.path = longPath

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.uri).toBe(`http://localhost:3003/${longPath}`)
    })

    test('should handle complex path with query parameters', async () => {
      mockRequest.params.path = 'api/v1/agreements?filter=active&sort=date'

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.uri).toBe('http://localhost:3003/api/v1/agreements?filter=active&sort=date')
    })

    test('should handle path with special characters', async () => {
      const specialPath = 'api/v1/agreements/test%20path/item-123'
      mockRequest.params.path = specialPath

      await getAgreementController.handler(mockRequest, mockH)

      const proxyCall = mockH.proxy.mock.calls[0][0]
      const mapUriResult = proxyCall.mapUri()

      expect(mapUriResult.uri).toBe(`http://localhost:3003/${specialPath}`)
    })
  })
})
