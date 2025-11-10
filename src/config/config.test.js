import { vi } from 'vitest'
import fs from 'fs'
import path from 'path'

const originalEnv = process.env
const envPath = path.join(process.cwd(), '.env')
const envBackupPath = path.join(process.cwd(), '.env.backup')

describe('config', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }

    // Temporarily rename .env file to prevent dotenv from loading it during tests
    if (fs.existsSync(envPath)) {
      fs.renameSync(envPath, envBackupPath)
    }
  })

  afterEach(() => {
    process.env = originalEnv

    // Restore .env file
    if (fs.existsSync(envBackupPath)) {
      fs.renameSync(envBackupPath, envPath)
    }
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

    // Clear module cache to ensure fresh import
    vi.resetModules()
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

    // Clear module cache to ensure fresh import
    vi.resetModules()
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

  describe('cookie consent configuration', () => {
    test('has correct default values', async () => {
      const { config } = await import('./config.js')

      expect(config.get('cookieConsent.cookiePolicyUrl')).toBe('/cookies')
      expect(config.get('cookieConsent.cookieName')).toBe('cookie_consent')
      expect(config.get('cookieConsent.expiryDays')).toBe(365)
    })

    test('allows cookie consent settings to be overridden via environment variables', async () => {
      process.env.COOKIE_POLICY_URL = '/privacy/cookies'
      process.env.COOKIE_CONSENT_EXPIRY_DAYS = '90'

      const { config } = await import('./config.js')

      expect(config.get('cookieConsent.cookiePolicyUrl')).toBe('/privacy/cookies')
      expect(config.get('cookieConsent.expiryDays')).toBe(90)
    })
  })
})
