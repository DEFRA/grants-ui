import { createServer } from '~/src/server/index.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { catchAll } from '~/src/server/common/helpers/errors.js'
import Wreck from '@hapi/wreck'
import { log } from '~/src/server/common/helpers/logging/log.js'

jest.mock('@hapi/wreck', () => ({
  get: jest.fn()
}))

jest.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    AUTH: {
      SIGN_IN_FAILURE: { level: 'error', messageFunc: jest.fn() }
    },
    SYSTEM: {
      SERVER_ERROR: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))

describe('#errors', () => {
  /** @type {Server} */
  let server

  beforeAll(async () => {
    // Mock the well-known OIDC config before server starts
    Wreck.get.mockResolvedValue({
      payload: {
        authorization_endpoint: 'https://mock-auth/authorize',
        token_endpoint: 'https://mock-auth/token'
      }
    })
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected Not Found page', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/non-existent-path'
    })

    expect(result).toEqual(expect.stringContaining('Page not found | Manage land-based actions'))
    expect(statusCode).toBe(statusCodes.notFound)
  })
})

describe('#catchAll', () => {
  const mockErrorLogger = jest.fn()
  const mockStack = 'Mock error stack'
  const errorPage = 'error/index'
  const mockRequest = (/** @type {number} */ statusCode) => ({
    response: {
      isBoom: true,
      stack: mockStack,
      message: 'Mock error message',
      output: {
        statusCode
      }
    },
    logger: { error: mockErrorLogger },
    path: '/test-path',
    method: 'GET'
  })
  const mockToolkitView = jest.fn()
  const mockToolkitCode = jest.fn()
  const mockToolkit = {
    view: mockToolkitView.mockReturnThis(),
    code: mockToolkitCode.mockReturnThis()
  }

  beforeEach(() => {
    mockErrorLogger.mockClear()
    mockToolkitView.mockClear()
    mockToolkitCode.mockClear()
    log.mockClear()
  })

  test('Should provide expected "Not Found" page', () => {
    catchAll(mockRequest(statusCodes.notFound), mockToolkit)

    expect(mockErrorLogger).not.toHaveBeenCalledWith(mockStack)
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Page not found',
      heading: statusCodes.notFound,
      message: 'Page not found'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCodes.notFound)
  })

  test('Should provide expected "Forbidden" page', () => {
    catchAll(mockRequest(statusCodes.forbidden), mockToolkit)

    expect(mockErrorLogger).not.toHaveBeenCalledWith(mockStack)
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Forbidden',
      heading: statusCodes.forbidden,
      message: 'Forbidden'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCodes.forbidden)
  })

  test('Should provide expected "Unauthorized" page', () => {
    catchAll(mockRequest(statusCodes.unauthorized), mockToolkit)

    expect(mockErrorLogger).not.toHaveBeenCalledWith(mockStack)
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Unauthorized',
      heading: statusCodes.unauthorized,
      message: 'Unauthorized'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCodes.unauthorized)
  })

  test('Should provide expected "Bad Request" page', () => {
    catchAll(mockRequest(statusCodes.badRequest), mockToolkit)

    expect(mockErrorLogger).not.toHaveBeenCalledWith(mockStack)
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Bad Request',
      heading: statusCodes.badRequest,
      message: 'Bad Request'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCodes.badRequest)
  })

  test('Should provide expected default page', () => {
    catchAll(mockRequest(statusCodes.imATeapot), mockToolkit)

    expect(mockErrorLogger).not.toHaveBeenCalledWith(mockStack)
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Something went wrong',
      heading: statusCodes.imATeapot,
      message: 'Something went wrong'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCodes.imATeapot)
  })

  test('Should provide expected "Something went wrong" page and log error for internalServerError', () => {
    catchAll(mockRequest(statusCodes.internalServerError), mockToolkit)

    // Should use structured logging instead of old logger
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        messageFunc: expect.any(Function)
      }),
      expect.objectContaining({
        error: expect.any(String),
        statusCode: statusCodes.internalServerError,
        path: expect.any(String),
        method: expect.any(String),
        stack: mockStack
      })
    )
    expect(mockErrorLogger).not.toHaveBeenCalled()
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Something went wrong',
      heading: statusCodes.internalServerError,
      message: 'Something went wrong'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCodes.internalServerError)
  })

  test('Should provide expected "Something went wrong" page and log system error for internalServerError', () => {
    const statusCode = statusCodes.internalServerError
    const request = mockRequest(statusCode)
    request.response.alreadyLogged = false

    request.path = '/not-auth-or-bell'

    catchAll(request, mockToolkit)

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: expect.anything(),
        messageFunc: expect.any(Function)
      }),
      expect.objectContaining({
        error: 'Mock error message',
        statusCode,
        path: '/not-auth-or-bell',
        method: 'GET',
        stack: mockStack
      })
    )
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Something went wrong',
      heading: statusCode,
      message: 'Something went wrong'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCode)
  })

  test('Should log Bell error when isBellError is true', () => {
    const statusCode = statusCodes.internalServerError
    const request = mockRequest(statusCode)
    request.response.alreadyLogged = false
    request.path = '/not-auth-bell'
    request.response.message = 'bell authentication failed'

    catchAll(request, mockToolkit)

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: expect.anything(),
        messageFunc: expect.any(Function)
      }),
      expect.objectContaining({
        error: 'bell authentication failed',
        step: 'bell_oauth_error'
      })
    )
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Something went wrong',
      heading: statusCode,
      message: 'Something went wrong'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCode)
  })

  test('Should skip repeated logging if alreadyLogged=true', () => {
    const statusCode = statusCodes.internalServerError
    const request = mockRequest(statusCode)
    request.response.alreadyLogged = true
    request.path = '/any-path'
    request.response.message = 'alreadyLogged'

    catchAll(request, mockToolkit)

    const callArgs = log.mock.calls.map((call) => call[1]?.step)
    expect(callArgs).not.toContain('auth_flow_error')
    expect(callArgs).not.toContain('bell_oauth_error')
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Something went wrong',
      heading: statusCode,
      message: 'Something went wrong'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCode)
  })

  test('Should default to 200 if no statusCode on non-Boom response', () => {
    const responseObj = { payload: 'OK' }
    const mockResponse = jest.fn().mockReturnThis()
    const mockCode = jest.fn().mockReturnThis()

    catchAll({ response: responseObj }, { response: mockResponse, code: mockCode })

    expect(mockResponse).toHaveBeenCalledWith(responseObj)
    expect(mockCode).toHaveBeenCalledWith(200)
  })
})

describe('#catchAll Redirect Handling', () => {
  const mockToolkitRedirect = jest.fn()
  const mockToolkit = {
    redirect: mockToolkitRedirect,
    view: jest.fn().mockReturnThis(),
    code: jest.fn().mockReturnThis()
  }

  beforeEach(() => {
    mockToolkitRedirect.mockClear()
  })

  test('should handle redirects when status code is 302 and location header is present', () => {
    const redirectUrl = '/somewhere-else'
    const mockRequest = {
      response: {
        isBoom: true,
        output: {
          statusCode: statusCodes.redirect,
          headers: {
            location: redirectUrl
          }
        }
      }
    }
    catchAll(mockRequest, mockToolkit)
    expect(mockToolkitRedirect).toHaveBeenCalledWith(redirectUrl)
  })

  test('should not handle redirect if location header is missing', () => {
    const mockRequest = {
      response: {
        isBoom: true,
        output: {
          statusCode: statusCodes.redirect,
          headers: {}
        }
      }
    }
    catchAll(mockRequest, mockToolkit)
    expect(mockToolkitRedirect).not.toHaveBeenCalled()
  })

  test('should not handle redirect if status code is not 302', () => {
    const mockRequest = {
      response: {
        isBoom: true,
        output: {
          statusCode: statusCodes.notFound,
          headers: {
            location: '/not-a-redirect'
          }
        }
      }
    }
    catchAll(mockRequest, mockToolkit)
    expect(mockToolkitRedirect).not.toHaveBeenCalled()
  })
})
/**
 * @import { Server } from '@hapi/hapi'
 */
