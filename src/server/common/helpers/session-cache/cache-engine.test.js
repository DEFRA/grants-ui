import { vi } from 'vitest'
import { Engine as CatboxRedis } from '@hapi/catbox-redis'
import { Engine as CatboxMemory } from '@hapi/catbox-memory'

import { getCacheEngine } from '~/src/server/common/helpers/session-cache/cache-engine.js'
import { config } from '~/src/config/config.js'
const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()

vi.mock('ioredis', async () => ({
  ...(await vi.importActual('ioredis')),
  Cluster: vi.fn().mockReturnValue({ on: () => ({}) }),
  Redis: vi.fn().mockReturnValue({ on: () => ({}) })
}))
vi.mock('@hapi/catbox-redis')
vi.mock('@hapi/catbox-memory')
vi.mock('~/src/server/common/helpers/logging/logger.js', async () => {
  const { mockLoggerFactoryWithCustomMethods } = await import('~/src/__mocks__')
  return mockLoggerFactoryWithCustomMethods({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  })
})

describe('#getCacheEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('When Redis cache engine has been requested', () => {
    beforeEach(() => {
      getCacheEngine('redis')
    })

    test('Should setup Redis cache', () => {
      expect(CatboxRedis).toHaveBeenCalledWith(expect.any(Object))
    })

    test('Should log expected Redis message', () => {
      expect(mockLoggerInfo).toHaveBeenCalledWith('Using Redis session cache')
    })
  })

  describe('When In memory cache engine has been requested', () => {
    beforeEach(() => {
      getCacheEngine()
    })

    test('Should setup In memory cache', () => {
      expect(CatboxMemory).toHaveBeenCalledTimes(1)
    })

    test('Should log expected CatBox memory message', () => {
      expect(mockLoggerInfo).toHaveBeenCalledWith('Using Catbox Memory session cache')
    })
  })

  describe('When In memory cache engine has been requested in Production', () => {
    beforeEach(() => {
      config.set('isProduction', true)
      getCacheEngine()
    })

    test('Should log Production warning message', () => {
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Catbox Memory is for local development only, it should not be used in production!'
      )
    })

    test('Should setup In memory cache', () => {
      expect(CatboxMemory).toHaveBeenCalledTimes(1)
    })

    test('Should log expected message', () => {
      expect(mockLoggerInfo).toHaveBeenCalledWith('Using Catbox Memory session cache')
    })
  })
})
