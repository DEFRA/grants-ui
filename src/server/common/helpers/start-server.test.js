import hapi from '@hapi/hapi'

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
    startServerImport = await import(
      '~/src/server/common/helpers/start-server.js'
    )

    createServerSpy = jest.spyOn(createServerImport, 'createServer')
    hapiServerSpy = jest.spyOn(hapi, 'server')
  })

  afterAll(() => {
    process.env = PROCESS_ENV
  })

  describe('When server starts', () => {
    let server

    afterAll(async () => {
      await server.stop({ timeout: 0 })
    })

    test('Should start up server as expected', async () => {
      server = await startServerImport.startServer()

      expect(createServerSpy).toHaveBeenCalled()
      expect(hapiServerSpy).toHaveBeenCalled()
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Using Catbox Memory session cache'
      )
      expect(mockHapiLoggerInfo).toHaveBeenNthCalledWith(
        1,
        'Custom secure context is disabled'
      )
      expect(mockHapiLoggerInfo).toHaveBeenNthCalledWith(
        2,
        'Server started successfully'
      )
      expect(mockHapiLoggerInfo).toHaveBeenNthCalledWith(
        3,
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
      expect(mockLoggerError).toHaveBeenCalledWith(
        Error('Server failed to start')
      )
    })
  })
})
