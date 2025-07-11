import { Cluster, Redis } from 'ioredis'
import { config } from '~/src/config/config.js'

import { buildRedisClient } from '~/src/server/common/helpers/redis-client.js'

describe('#buildRedisClient', () => {
  describe('When Redis Single InstanceCache is requested', () => {
    beforeEach(() => {
      buildRedisClient({
        host: '127.0.0.1',
        keyPrefix: 'grants-ui:',
        useSingleInstanceCache: true,
        useTLS: false,
        username: '',
        password: ''
      })
    })

    test('Should instantiate a single Redis client', () => {
      expect(Redis).toHaveBeenCalledWith({
        db: 0,
        host: '127.0.0.1',
        keyPrefix: 'grants-ui:',
        port: 6379
      })
    })

    test('Should log Redis connect and error events', () => {
      const mockOn = jest.fn((event, cb) => {
        if (event === 'connect') cb()
        if (event === 'error') cb(new Error('fail'))
      })

      Redis.mockReturnValue({ on: mockOn })

      buildRedisClient({
        ...config.get('redis'),
        useSingleInstanceCache: true
      })

      expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function))
    })

    test('Should resolve DNS lookup in cluster mode', () => {
      const mockOn = jest.fn()
      let dnsCallback

      Cluster.mockImplementation((nodes, options) => {
        dnsCallback = options.dnsLookup
        return { on: mockOn }
      })

      buildRedisClient({
        ...config.get('redis'),
        useSingleInstanceCache: false
      })

      const mockCb = jest.fn()
      dnsCallback('localhost', mockCb)

      expect(mockCb).toHaveBeenCalledWith(null, 'localhost')
    })
  })

  describe('When a Redis Cluster is requested', () => {
    beforeEach(() => {
      buildRedisClient({
        host: '127.0.0.1',
        keyPrefix: 'grants-ui:',
        useSingleInstanceCache: false,
        useTLS: true,
        username: 'user',
        password: 'pass'
      })
    })

    test('Should instantiate a Redis Cluster client', () => {
      expect(Cluster).toHaveBeenCalledWith([{ host: '127.0.0.1', port: 6379 }], {
        dnsLookup: expect.any(Function),
        keyPrefix: 'grants-ui:',
        redisOptions: { db: 0, password: 'pass', tls: {}, username: 'user' },
        slotsRefreshTimeout: 10000
      })
    })
  })
})
