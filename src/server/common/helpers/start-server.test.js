import { vi } from 'vitest'
import Wreck from '@hapi/wreck'
import { logger } from '~/src/server/common/helpers/logging/log.js'

const mockHapiLoggerInfo = vi.fn()
const mockHapiLoggerError = vi.fn()

vi.mock('hapi-pino', async () => {
  const { mockHapiPino } = await import('~/src/__mocks__')
  return {
    ...mockHapiPino({
      info: mockHapiLoggerInfo,
      error: mockHapiLoggerError
    }),
    name: 'mock-hapi-pino'
  }
})

vi.mock('~/src/server/common/forms/services/forms-redis.js', () => ({
  closeFormsRedisClient: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  debug: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}))

// Mock the auth plugin dependencies
vi.mock('~/src/server/auth/get-oidc-config.js', () => ({
  getOidcConfig: vi.fn().mockResolvedValue({
    authorization_endpoint: 'https://mock-auth/authorize',
    token_endpoint: 'https://mock-auth/token',
    jwks_uri: 'https://mock-auth/jwks',
    end_session_endpoint: 'https://mock-auth/logout'
  })
}))

describe('#startServer', () => {
  const PROCESS_ENV = process.env
  let startServerImport, mockLoggerInfo, mockLoggerError

  beforeEach(() => {
    vi.clearAllMocks()

    mockLoggerInfo = logger.info
    mockLoggerError = logger.error
  })

  beforeAll(async () => {
    process.env = { ...PROCESS_ENV }
    process.env.PORT = '3097' // Set to obscure port to avoid conflicts

    // Mock the well-known OIDC config before server starts
    Wreck.get.mockResolvedValue({
      payload: {
        authorization_endpoint: 'https://mock-auth/authorize',
        token_endpoint: 'https://mock-auth/token',
        jwks_uri: 'https://mock-auth/jwks',
        end_session_endpoint: 'https://mock-auth/logout'
      }
    })
  })

  afterAll(() => {
    process.env = PROCESS_ENV
  })

  describe('When server starts', () => {
    let server

    afterAll(async () => {
      if (server && typeof server.stop === 'function') {
        await server.stop({ timeout: 0 })
      }
    })

    test('Should start up server as expected', async () => {
      const { createServer } = await import('~/src/server/index.js')
      const mockServer = {
        start: vi.fn().mockResolvedValue(),
        stop: vi.fn().mockResolvedValue(),
        logger: {
          info: mockHapiLoggerInfo,
          error: mockHapiLoggerError
        }
      }
      createServer.mockResolvedValueOnce(mockServer)

      startServerImport = await import('~/src/server/common/helpers/start-server.js')
      server = await startServerImport.startServer()

      expect(createServer).toHaveBeenCalled()
      // Note: Session cache logging happens inside createServer which is fully mocked, so we can't test that
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith('Server started successfully')
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith('Access your frontend on http://localhost:3097')
    })
  })

  describe('When server start fails', () => {
    test('Should log failed startup message', async () => {
      const { createServer } = await import('~/src/server/index.js')
      createServer.mockRejectedValueOnce(new Error('Server failed to start'))

      startServerImport = await import('~/src/server/common/helpers/start-server.js')
      await startServerImport.startServer()

      expect(mockLoggerInfo).toHaveBeenCalledWith('Server failed to start :(')
      expect(mockLoggerError).toHaveBeenCalledWith(Error('Server failed to start'))
    })
  })

  describe('shutdown signal handlers', () => {
    let mockServer, onSpy, originalExitCode

    beforeEach(async () => {
      vi.clearAllMocks()
      originalExitCode = process.exitCode

      onSpy = vi.spyOn(process, 'on')

      const { createServer } = await import('~/src/server/index.js')
      mockServer = {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        logger: { info: vi.fn(), error: vi.fn() }
      }
      createServer.mockResolvedValueOnce(mockServer)

      const mod = await import('~/src/server/common/helpers/start-server.js')
      await mod.startServer()
    })

    afterEach(() => {
      onSpy.mockRestore()
      process.removeAllListeners('SIGTERM')
      process.removeAllListeners('SIGINT')
      process.exitCode = originalExitCode
    })

    const getHandler = (onSpy, signal) => onSpy.mock.calls.find(([ev]) => ev === signal)?.[1]

    test('SIGTERM stops the server then closes the forms Redis client', async () => {
      const { closeFormsRedisClient } = await import('~/src/server/common/forms/services/forms-redis.js')
      await getHandler(onSpy, 'SIGTERM')()

      expect(mockServer.stop).toHaveBeenCalledWith({ timeout: 10000 })
      expect(closeFormsRedisClient).toHaveBeenCalledTimes(1)
    })

    test('SIGINT stops the server then closes the forms Redis client', async () => {
      const { closeFormsRedisClient } = await import('~/src/server/common/forms/services/forms-redis.js')
      await getHandler(onSpy, 'SIGINT')()

      expect(mockServer.stop).toHaveBeenCalledWith({ timeout: 10000 })
      expect(closeFormsRedisClient).toHaveBeenCalledTimes(1)
    })

    test('logs error and sets exitCode to 1 when shutdown throws', async () => {
      const { closeFormsRedisClient } = await import('~/src/server/common/forms/services/forms-redis.js')
      const error = new Error('redis error')
      vi.mocked(closeFormsRedisClient).mockRejectedValueOnce(error)

      await getHandler(onSpy, 'SIGTERM')()

      expect(logger.error).toHaveBeenCalledWith(`Error during shutdown: ${error}`)
      expect(process.exitCode).toBe(1)
    })
  })
})
