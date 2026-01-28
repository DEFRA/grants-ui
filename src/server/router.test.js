import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalNodeEnv = process.env.NODE_ENV
const originalEnvironment = process.env.ENVIRONMENT

vi.mock('@hapi/inert', () => ({ default: { plugin: { name: 'inert', register: vi.fn() } } }))
vi.mock('~/src/server/auth/index.js', () => ({ auth: { plugin: { name: 'auth', register: vi.fn() } } }))
vi.mock('~/src/server/common/helpers/serve-static-files.js', () => ({
  serveStaticFiles: { plugin: { name: 'serveStaticFiles', register: vi.fn() } }
}))
vi.mock('~/src/server/health/index.js', () => ({ health: { plugin: { name: 'health', register: vi.fn() } } }))
vi.mock('~/src/server/home/index.js', () => ({ home: { plugin: { name: 'home', register: vi.fn() } } }))
vi.mock('~/src/server/agreements/index.js', () => ({
  agreements: { plugin: { name: 'agreements', register: vi.fn() } }
}))
vi.mock('~/src/server/dev-tools/index.js', () => ({
  devTools: { plugin: { name: 'devTools', register: vi.fn() } }
}))
vi.mock('~/src/server/confirmation/config-confirmation.js', () => ({
  configConfirmation: { plugin: { name: 'configConfirmation', register: vi.fn() } }
}))
vi.mock('./dev-tools/clear-application-state.js', () => ({
  clearApplicationState: { plugin: { name: 'clearApplicationState', register: vi.fn() } }
}))
vi.mock('~/src/server/cookies/index.js', () => ({
  cookies: { plugin: { name: 'cookies', register: vi.fn() } }
}))

describe('router', () => {
  let mockServer
  let registeredPlugins

  beforeEach(() => {
    registeredPlugins = []
    mockServer = {
      register: vi.fn((plugins) => {
        const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
        pluginArray.forEach((p) => {
          registeredPlugins.push(p.plugin?.name || p.name || 'unknown')
        })
      })
    }
  })

  afterEach(() => {
    vi.resetModules()
    process.env.NODE_ENV = originalNodeEnv
    process.env.ENVIRONMENT = originalEnvironment
  })

  it('should register devTools when enabled and in local development', async () => {
    process.env.NODE_ENV = 'development'
    process.env.ENVIRONMENT = 'local'

    vi.doMock('~/src/config/config.js', () => ({
      config: {
        get: vi.fn((key) => {
          const values = {
            'devTools.enabled': true,
            cdpEnvironment: 'dev'
          }
          return values[key]
        })
      }
    }))

    const { router } = await import('./router.js')
    await router.plugin.register(mockServer)

    expect(registeredPlugins).toContain('devTools')
  })

  it('should not register devTools in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ENVIRONMENT = 'local'

    vi.doMock('~/src/config/config.js', () => ({
      config: {
        get: vi.fn((key) => {
          const values = {
            'devTools.enabled': true,
            cdpEnvironment: 'prod'
          }
          return values[key]
        })
      }
    }))

    const { router } = await import('./router.js')
    await router.plugin.register(mockServer)

    expect(registeredPlugins).not.toContain('devTools')
  })

  it('should not register devTools when ENVIRONMENT is not local', async () => {
    process.env.NODE_ENV = 'development'
    process.env.ENVIRONMENT = 'dev'

    vi.doMock('~/src/config/config.js', () => ({
      config: {
        get: vi.fn((key) => {
          const values = {
            'devTools.enabled': true,
            cdpEnvironment: 'dev'
          }
          return values[key]
        })
      }
    }))

    const { router } = await import('./router.js')
    await router.plugin.register(mockServer)

    expect(registeredPlugins).not.toContain('devTools')
  })

  it('should not register devTools when devTools.enabled is false', async () => {
    process.env.NODE_ENV = 'development'
    process.env.ENVIRONMENT = 'local'

    vi.doMock('~/src/config/config.js', () => ({
      config: {
        get: vi.fn((key) => {
          const values = {
            'devTools.enabled': false,
            cdpEnvironment: 'dev'
          }
          return values[key]
        })
      }
    }))

    const { router } = await import('./router.js')
    await router.plugin.register(mockServer)

    expect(registeredPlugins).not.toContain('devTools')
  })
})
