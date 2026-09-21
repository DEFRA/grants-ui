import { vi } from 'vitest'
import { Cluster, Redis } from 'ioredis'
import { config } from '~/src/config/config.js'

import { buildRedisClient, waitForRedisReady } from '~/src/server/common/helpers/redis-client.js'

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function () {
    return { on: vi.fn() }
  }),
  Cluster: vi.fn().mockImplementation(function () {
    return { on: vi.fn() }
  })
}))
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  debug: vi.fn(),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

describe('#buildRedisClient', () => {
  describe('When Redis Single InstanceCache is requested', () => {
    test('Should log Redis connect and error events', () => {
      const mockOn = vi.fn((event, cb) => {
        if (event === 'connect') {
          cb()
        }
        if (event === 'error') {
          cb(new Error('fail'))
        }
      })

      vi.mocked(Redis).mockImplementation(function () {
        return { on: mockOn }
      })

      buildRedisClient({
        ...config.get('redis'),
        useSingleInstanceCache: true
      })

      expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function))
    })

    test('Should resolve DNS lookup in cluster mode', () => {
      const mockOn = vi.fn()
      let dnsCallback

      vi.mocked(Cluster).mockImplementation(function (nodes, options) {
        dnsCallback = options.dnsLookup
        return { on: mockOn }
      })

      buildRedisClient({
        ...config.get('redis'),
        useSingleInstanceCache: false
      })

      const mockCb = vi.fn()
      dnsCallback('localhost', mockCb)

      expect(mockCb).toHaveBeenCalledWith(null, 'localhost')
    })
  })

  describe('#waitForRedisReady', () => {
    test('resolves immediately when client status is already ready', async () => {
      const client = { status: 'ready' }
      await expect(waitForRedisReady(client)).resolves.toBeUndefined()
    })

    test('resolves when the ready event fires', async () => {
      const listeners = {}
      const client = {
        status: 'connecting',
        once: vi.fn((event, cb) => {
          listeners[event] = cb
        })
      }

      const promise = waitForRedisReady(client)
      listeners.ready()
      await expect(promise).resolves.toBeUndefined()
    })

    test('rejects when the error event fires', async () => {
      const listeners = {}
      const client = {
        status: 'connecting',
        once: vi.fn((event, cb) => {
          listeners[event] = cb
        })
      }

      const error = new Error('connection refused')
      const promise = waitForRedisReady(client)
      listeners.error(error)
      await expect(promise).rejects.toThrow('connection refused')
    })
  })
})
