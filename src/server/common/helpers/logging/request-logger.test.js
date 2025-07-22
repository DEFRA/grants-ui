import { requestLogger } from './request-logger.js'
import { loggerOptions } from './logger-options.js'
import hapiPino from 'hapi-pino'

// Mock hapi-pino
jest.mock('hapi-pino', () => ({
  __esModule: true,
  default: {
    name: 'hapi-pino',
    register: jest.fn()
  }
}))

// Mock logger options
jest.mock('./logger-options.js', () => ({
  loggerOptions: {
    prettyPrint: false,
    level: 'info'
  }
}))

describe('Request Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should export request logger plugin configuration', () => {
    expect(requestLogger).toBeDefined()
    expect(requestLogger.plugin).toBeDefined()
    expect(requestLogger.options).toBeDefined()
  })

  it('should have correct plugin configuration', () => {
    expect(requestLogger.plugin).toBe(hapiPino)
    expect(requestLogger.options).toBe(loggerOptions)
  })

  it('should have hapi-pino plugin', () => {
    expect(requestLogger.plugin).toEqual(hapiPino)
  })

  it('should have logger options', () => {
    expect(requestLogger.options).toEqual(loggerOptions)
  })

  it('should be properly structured for Hapi.js', () => {
    expect(typeof requestLogger.plugin).toBe('object')
    expect(typeof requestLogger.options).toBe('object')
    expect(requestLogger.plugin.name).toBe('hapi-pino')
    expect(typeof requestLogger.plugin.register).toBe('function')
  })

  it('should use configured logger options', () => {
    expect(requestLogger.options.prettyPrint).toBe(false)
    expect(requestLogger.options.level).toBe('info')
  })
})
