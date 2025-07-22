import hapi from '@hapi/hapi'
import Wreck from '@hapi/wreck'

jest.mock('@hapi/wreck', () => ({
  get: jest.fn()
}))

const mockLoggerInfo = jest.fn()
const mockLoggerError = jest.fn()

const mockHapiLoggerInfo = jest.fn()
const mockHapiLoggerError = jest.fn()

jest.mock('hapi-pino', () => ({
  register: (server) => {
    server.decorate('server', 'logger', {
      info: mockHapiLoggerInfo,
      error: mockHapiLoggerError
    })
  },
  name: 'mock-hapi-pino'
}))

jest.mock('~/src/server/common/helpers/logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  })
}))

// Mock the auth plugin dependencies
jest.mock('~/src/server/auth/get-oidc-config.js', () => ({
  getOidcConfig: jest.fn().mockResolvedValue({
    authorization_endpoint: 'https://mock-auth/authorize',
    token_endpoint: 'https://mock-auth/token',
    jwks_uri: 'https://mock-auth/jwks',
    end_session_endpoint: 'https://mock-auth/logout'
  })
}))

jest.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: jest.fn(),
  LogCodes: {
    AUTH: {
      AUTH_DEBUG: { level: 'debug', messageFunc: jest.fn() },
      SIGN_IN_FAILURE: { level: 'error', messageFunc: jest.fn() }
    },
    SYSTEM: {
      SERVER_ERROR: { level: 'error', messageFunc: jest.fn() }
    }
  }
}))

describe('#startServer', () => {
  const PROCESS_ENV = process.env
  let createServerSpy
  let hapiServerSpy
  let startServerImport
  let createServerImport

  beforeAll(async () => {
    process.env = { ...PROCESS_ENV }
    process.env.PORT = '3097' // Set to obscure port to avoid conflicts

    createServerImport = await import('~/src/server/index.js')
    startServerImport = await import('~/src/server/common/helpers/start-server.js')

    createServerSpy = jest.spyOn(createServerImport, 'createServer')
    hapiServerSpy = jest.spyOn(hapi, 'server')

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
      server = await startServerImport.startServer()

      expect(createServerSpy).toHaveBeenCalled()
      expect(hapiServerSpy).toHaveBeenCalled()
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.stringMatching(/Using (Redis|Catbox Memory) session cache/)
      )

      expect(mockHapiLoggerInfo).toHaveBeenCalledWith(
        'Server started successfully'
      )
      expect(mockHapiLoggerInfo).toHaveBeenCalledWith(
        'Access your frontend on http://localhost:3097'
      )
    })
  })

  describe('When server start fails', () => {
    beforeAll(() => {
      createServerSpy.mockRejectedValue(new Error('Server failed to start'))
    })

    test('Should log failed startup message', async () => {
      await startServerImport.startServer()

      expect(mockLoggerInfo).toHaveBeenCalledWith('Server failed to start :(')
      expect(mockLoggerError).toHaveBeenCalledWith(Error('Server failed to start'))
    })
  })
})
