import { vi } from 'vitest'
import Wreck from '@hapi/wreck'
const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerDebug = jest.fn()

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

vi.mock('~/src/server/common/helpers/logging/logger.js', async () => {
  const { mockLoggerFactoryWithCustomMethods } = await import('~/src/__mocks__')
  return mockLoggerFactoryWithCustomMethods({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    debug: (...args) => mockLoggerDebug(...args)
  })
})

// Mock the auth plugin dependencies
vi.mock('~/src/server/auth/get-oidc-config.js', () => ({
  getOidcConfig: vi.fn().mockResolvedValue({
    authorization_endpoint: 'https://mock-auth/authorize',
    token_endpoint: 'https://mock-auth/token',
    jwks_uri: 'https://mock-auth/jwks',
    end_session_endpoint: 'https://mock-auth/logout'
  })
}))

vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

describe('#startServer', () => {
  const PROCESS_ENV = process.env
  let startServerImport

  beforeEach(() => {
    vi.clearAllMocks()
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
})
