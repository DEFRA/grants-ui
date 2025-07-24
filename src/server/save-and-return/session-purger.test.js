import { sessionPurger } from './session-purger.js'
import { resilientFetch } from '~/src/server/common/helpers/resilient-fetch/resilient-fetch.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'

jest.mock('~/src/server/common/helpers/resilient-fetch/resilient-fetch.js', () => ({
  resilientFetch: jest.fn()
}))
jest.mock('~/src/server/save-and-return/key-generator.js', () => ({
  keyGenerator: jest.fn(() => 'user123:business123:grant123'),
  getIdentity: jest.fn(() => ({
    userId: 'user123',
    businessId: 'business123',
    grantId: 'grant123'
  }))
}))
jest.mock('~/src/server/common/constants/status-codes.js', () => ({
  statusCodes: { notFound: 404 }
}))
jest.mock('~/src/server/common/constants/grants-ui-backend.js', () => ({
  GRANTS_UI_BACKEND_ENDPOINT: 'https://mock-backend'
}))

describe('sessionPurger', () => {
  let request, server, cache

  beforeEach(() => {
    request = {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      },
      yar: { id: 'session-id' }
    }
    cache = {
      drop: jest.fn().mockResolvedValue()
    }
    server = { app: { cache } }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should purge both MongoDB and Redis successfully', async () => {
    resilientFetch.mockResolvedValue({ ok: true, status: 200 })

    const result = await sessionPurger('some-key', request, server)

    expect(resilientFetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'DELETE' }))
    expect(cache.drop).toHaveBeenCalledWith('user123:business123:grant123')
    expect(request.logger.info).toHaveBeenCalledWith('SessionPurger: Session purge completed successfully')
    expect(result).toBe(true)
  })

  it('Mongo fails (404 = treated as not error), but Redis succeeds', async () => {
    resilientFetch.mockResolvedValue({ ok: false, status: statusCodes.notFound })

    const result = await sessionPurger('some-key', request, server)
    expect(resilientFetch).toHaveBeenCalled()
    expect(request.logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('MongoDB purge failed')) // Because 404 is a "success"
    expect(request.logger.info).toHaveBeenCalledWith('SessionPurger: Session purge completed successfully')
    expect(result).toBe(true)
  })

  it('Mongo fails (other than 404), Redis still runs, warns', async () => {
    resilientFetch.mockResolvedValue({ ok: false, status: 500 })

    const result = await sessionPurger('some-key', request, server)

    expect(resilientFetch).toHaveBeenCalled()
    expect(request.logger.warn).toHaveBeenCalledWith(
      'SessionPurger: MongoDB purge failed, continuing with Redis clearing'
    )
    expect(request.logger.warn).toHaveBeenCalledWith('SessionPurger: Session purge completed with some failures')
    expect(result).toBe(false)
  })

  it('Mongo throws AbortError, returns false but Redis still runs, logs error', async () => {
    const abortError = new Error('timeout')
    abortError.name = 'AbortError'
    resilientFetch.mockRejectedValue(abortError)

    const result = await sessionPurger('some-key', request, server)

    expect(request.logger.error).toHaveBeenCalledWith(
      ['session-purger'],
      'MongoDB purge timed out after 10 seconds',
      abortError
    )
    expect(request.logger.warn).toHaveBeenCalledWith(
      'SessionPurger: MongoDB purge failed, continuing with Redis clearing'
    )
    expect(request.logger.warn).toHaveBeenCalledWith('SessionPurger: Session purge completed with some failures')
    expect(result).toBe(false)
  })

  it('Mongo throws non-abort error, logs, Redis still runs', async () => {
    const mongoErr = new Error('other')
    mongoErr.name = 'AnyOther'
    resilientFetch.mockRejectedValue(mongoErr)
    const result = await sessionPurger('some-key', request, server)
    expect(request.logger.error).toHaveBeenCalledWith(
      ['session-purger'],
      'Failed to purge session from MongoDB',
      mongoErr
    )
    expect(request.logger.warn).toHaveBeenCalledWith(
      'SessionPurger: MongoDB purge failed, continuing with Redis clearing'
    )
    expect(result).toBe(false)
  })

  it('Redis throws error, logs error, returns expected success=false', async () => {
    resilientFetch.mockResolvedValue({ ok: true, status: 200 })
    cache.drop.mockRejectedValue(new Error('redis-fail'))
    const result = await sessionPurger('some-key', request, server)
    expect(request.logger.error).toHaveBeenCalledWith(
      ['session-purger'],
      'SessionPurger: Failed to clear Redis cache',
      expect.any(Error)
    )
    expect(request.logger.warn).toHaveBeenCalledWith('SessionPurger: Session purge completed with some failures')
    expect(result).toBe(false)
  })

  it('If yar.id missing, logs warn, still returns true if Mongo succeeded', async () => {
    resilientFetch.mockResolvedValue({ ok: true, status: 200 })
    request.yar.id = null
    const result = await sessionPurger('some-key', request, server)
    expect(request.logger.warn).toHaveBeenCalledWith('SessionPurger: No session ID available for Redis clearing')
    expect(result).toBe(true)
  })

  it('does nothing and returns early if GRANTS_UI_BACKEND_ENDPOINT is not set', async () => {
    jest.resetModules()
    jest.doMock('~/src/server/common/constants/grants-ui-backend.js', () => ({
      GRANTS_UI_BACKEND_ENDPOINT: undefined
    }))
    const { sessionPurger } = await import('./session-purger.js')

    const result = await sessionPurger('some-key', request, server)
    expect(request.logger.debug).toHaveBeenCalledWith(
      'SessionPurger: Backend not configured, using default clearState behavior'
    )
    expect(result).toBeUndefined()
  })
})
