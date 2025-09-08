import { vi } from 'vitest'

const originalEnv = process.env

describe('config', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test.each([
    [
      'production',
      {
        'log.format': 'ecs',
        'log.redact': ['req.headers.authorization', 'req.headers.cookie', 'res.headers'],
        isSecureContextEnabled: true,
        isMetricsEnabled: true,
        'session.cache.engine': 'redis'
      }
    ],
    [
      'development',
      {
        'log.format': 'pino-pretty',
        'log.redact': [],
        isSecureContextEnabled: false,
        isMetricsEnabled: false,
        'session.cache.engine': 'memory'
      }
    ],
    [
      'test',
      {
        'log.format': 'pino-pretty',
        'log.redact': [],
        isSecureContextEnabled: false,
        isMetricsEnabled: false,
        'session.cache.engine': 'memory'
      }
    ],
    [
      undefined,
      {
        'log.format': 'pino-pretty',
        'log.redact': [],
        isSecureContextEnabled: false,
        isMetricsEnabled: false,
        'session.cache.engine': 'memory'
      }
    ]
  ])('uses correct defaults when NODE_ENV is %s', async (nodeEnv, expected) => {
    if (nodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = nodeEnv
    }

    const { config } = await import('./config.js')

    Object.entries(expected).forEach(([key, value]) => {
      expect(config.get(key)).toEqual(value)
    })
  })

  test.each([
    [
      'production',
      {
        LOG_FORMAT: 'pino-pretty',
        ENABLE_SECURE_CONTEXT: 'false',
        SESSION_CACHE_ENGINE: 'memory'
      },
      {
        'log.format': 'pino-pretty',
        isSecureContextEnabled: false,
        'session.cache.engine': 'memory'
      }
    ],
    [
      'development',
      {
        LOG_FORMAT: 'ecs',
        ENABLE_SECURE_CONTEXT: 'true',
        SESSION_CACHE_ENGINE: 'redis'
      },
      {
        'log.format': 'ecs',
        isSecureContextEnabled: true,
        'session.cache.engine': 'redis'
      }
    ]
  ])('respects environment variable overrides in %s', async (nodeEnv, envVars, expected) => {
    process.env.NODE_ENV = nodeEnv
    Object.entries(envVars).forEach(([key, value]) => {
      process.env[key] = value
    })

    const { config } = await import('./config.js')

    Object.entries(expected).forEach(([key, value]) => {
      expect(config.get(key)).toEqual(value)
    })
  })

  test('has correct default values for non-environment dependent settings', async () => {
    const { config } = await import('./config.js')

    expect(config.get('httpProxy')).toBeNull()
    expect(config.get('sessionTimeout')).toBe(14400000)
  })

  test('config validation works correctly', async () => {
    const { config } = await import('./config.js')

    expect(() => config.validate()).not.toThrow()
  })
})
