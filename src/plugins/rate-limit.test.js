import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest'
import { rateLimitPlugin, getClientIp } from '~/src/plugins/rate-limit.js'

vi.mock('hapi-rate-limit', () => ({
  default: { name: 'hapi-rate-limit' }
}))

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    SYSTEM: {
      RATE_LIMIT_EXCEEDED: { level: 'warn', messageFunc: vi.fn() }
    }
  }
}))

/**
 * Helper to set up mock config with specific overrides
 * @param {Record<string, unknown>} mockConfig - The mock config object
 * @param {Record<string, unknown>} overrides - Config values to override
 */
const setupMockConfig = (mockConfig, overrides = {}) => {
  mockConfig.get.mockImplementation((key) => {
    if (key === 'rateLimit.enabled') {
      return overrides['rateLimit.enabled'] ?? true
    }
    return overrides[key] ?? undefined
  })
}

describe('rate-limit plugin', () => {
  let mockServer
  let mockConfig
  let mockLog

  beforeEach(async () => {
    vi.clearAllMocks()

    const { config } = await import('~/src/config/config.js')
    mockConfig = config

    const { log } = await import('~/src/server/common/helpers/logging/log.js')
    mockLog = log

    mockServer = {
      register: vi.fn(),
      ext: vi.fn()
    }
  })

  afterEach(() => {
    vi.resetModules()
  })

  test('should have correct plugin name', () => {
    expect(rateLimitPlugin.plugin.name).toBe('rate-limit')
  })

  describe('plugin registration', () => {
    test('should skip registration when rate limiting is disabled', async () => {
      setupMockConfig(mockConfig, { 'rateLimit.enabled': false })

      await rateLimitPlugin.plugin.register(mockServer)

      expect(mockServer.register).not.toHaveBeenCalled()
    })

    test('should register hapi-rate-limit plugin when enabled', async () => {
      setupMockConfig(mockConfig)

      await rateLimitPlugin.plugin.register(mockServer)

      expect(mockServer.register).toHaveBeenCalledTimes(1)
      expect(mockServer.register).toHaveBeenCalledWith({
        plugin: { name: 'hapi-rate-limit' },
        options: expect.objectContaining({
          enabled: true,
          userAttribute: 'sessionId',
          addressOnly: false,
          proxyHeaderName: 'x-forwarded-for',
          headers: true
        })
      })
    })

    const configKeyTests = [
      { configKey: 'rateLimit.trustProxy', optionKey: 'trustProxy' },
      { configKey: 'rateLimit.userLimit', optionKey: 'userLimit' },
      { configKey: 'rateLimit.pathLimit', optionKey: 'pathLimit' },
      { configKey: 'rateLimit.authLimit', optionKey: 'authLimit' }
    ]

    test.each(configKeyTests)(
      'should pass $configKey config value to $optionKey option',
      async ({ configKey, optionKey }) => {
        const testValue = 'test-value-for-' + optionKey
        setupMockConfig(mockConfig, { [configKey]: testValue })

        await rateLimitPlugin.plugin.register(mockServer)

        const registerCall = mockServer.register.mock.calls[0][0]
        expect(registerCall.options[optionKey]).toBe(testValue)
      }
    )

    test('should configure cache segments with userLimitPeriod', async () => {
      const testPeriod = 120000
      setupMockConfig(mockConfig, { 'rateLimit.userLimitPeriod': testPeriod })

      await rateLimitPlugin.plugin.register(mockServer)

      const registerCall = mockServer.register.mock.calls[0][0]
      expect(registerCall.options.userCache).toEqual({
        segment: 'rate-limit-user',
        expiresIn: testPeriod
      })
      expect(registerCall.options.pathCache).toEqual({
        segment: 'rate-limit-path',
        expiresIn: testPeriod
      })
      expect(registerCall.options.authCache).toEqual({
        segment: 'rate-limit-auth',
        expiresIn: testPeriod
      })
    })

    test('should pass getClientIp as getIpFromProxyHeader', async () => {
      setupMockConfig(mockConfig)

      await rateLimitPlugin.plugin.register(mockServer)

      const registerCall = mockServer.register.mock.calls[0][0]
      expect(registerCall.options.getIpFromProxyHeader).toBe(getClientIp)
    })

    test('should register onPreResponse extension for logging', async () => {
      setupMockConfig(mockConfig)

      await rateLimitPlugin.plugin.register(mockServer)

      expect(mockServer.ext).toHaveBeenCalledWith('onPreResponse', expect.any(Function))
    })
  })

  describe('rate limit logging', () => {
    test('should log when 429 response is returned', async () => {
      setupMockConfig(mockConfig)

      await rateLimitPlugin.plugin.register(mockServer)

      const onPreResponseHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: {
          isBoom: true,
          output: { statusCode: 429 }
        },
        path: '/test-path',
        headers: {
          'x-forwarded-for': '192.168.1.100',
          'user-agent': 'TestBrowser/1.0'
        },
        info: { remoteAddress: '127.0.0.1' },
        auth: { credentials: { contactId: 'user123' } }
      }
      const mockH = { continue: Symbol('continue') }

      const result = onPreResponseHandler(mockRequest, mockH)

      expect(mockLog).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn' }),
        expect.objectContaining({
          path: '/test-path',
          ip: '192.168.1.100',
          userId: 'user123',
          userAgent: 'TestBrowser/1.0'
        }),
        mockRequest
      )
      expect(result).toBe(mockH.continue)
    })

    test('should not log for non-429 responses', async () => {
      setupMockConfig(mockConfig)

      await rateLimitPlugin.plugin.register(mockServer)

      const onPreResponseHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: {
          isBoom: true,
          output: { statusCode: 500 }
        },
        path: '/test-path',
        headers: {},
        info: { remoteAddress: '127.0.0.1' }
      }
      const mockH = { continue: Symbol('continue') }

      onPreResponseHandler(mockRequest, mockH)

      expect(mockLog).not.toHaveBeenCalled()
    })

    test('should not log for non-Boom responses', async () => {
      setupMockConfig(mockConfig)

      await rateLimitPlugin.plugin.register(mockServer)

      const onPreResponseHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: { isBoom: false },
        path: '/test-path',
        headers: {},
        info: { remoteAddress: '127.0.0.1' }
      }
      const mockH = { continue: Symbol('continue') }

      onPreResponseHandler(mockRequest, mockH)

      expect(mockLog).not.toHaveBeenCalled()
    })

    test('should use remoteAddress when x-forwarded-for is missing', async () => {
      setupMockConfig(mockConfig)

      await rateLimitPlugin.plugin.register(mockServer)

      const onPreResponseHandler = mockServer.ext.mock.calls[0][1]
      const mockRequest = {
        response: {
          isBoom: true,
          output: { statusCode: 429 }
        },
        path: '/test-path',
        headers: { 'user-agent': 'TestBrowser/1.0' },
        info: { remoteAddress: '10.0.0.1' },
        auth: {}
      }
      const mockH = { continue: Symbol('continue') }

      onPreResponseHandler(mockRequest, mockH)

      expect(mockLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ip: '10.0.0.1' }), mockRequest)
    })
  })

  describe('getClientIp', () => {
    const nullCases = [
      { input: undefined, description: 'undefined input' },
      { input: '', description: 'empty string' },
      { input: null, description: 'null input' }
    ]

    test.each(nullCases)('should return null for $description', ({ input }) => {
      expect(getClientIp(input)).toBeNull()
    })

    const validIpCases = [
      { input: '192.168.1.1', expected: '192.168.1.1', description: 'single IPv4' },
      {
        input: '192.168.1.1, 10.0.0.1, 172.16.0.1',
        expected: '192.168.1.1',
        description: 'comma-separated list (returns first)'
      },
      { input: '  192.168.1.1  ', expected: '192.168.1.1', description: 'IP with whitespace (trimmed)' },
      { input: '2001:db8::1', expected: '2001:db8::1', description: 'single IPv6' },
      {
        input: '2001:db8::1, 192.168.1.1',
        expected: '2001:db8::1',
        description: 'mixed IPv6/IPv4 list (returns first)'
      },
      { input: '10.0.0.1,20.0.0.1', expected: '10.0.0.1', description: 'list without spaces' }
    ]

    test.each(validIpCases)('should return $expected for $description', ({ input, expected }) => {
      expect(getClientIp(input)).toBe(expected)
    })
  })
})
