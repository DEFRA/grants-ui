import { vi } from 'vitest'
import { devTools, errorRoutes } from './index.js'

// Number of non-error routes (dev home + demo confirmation)
const BASE_ROUTES_COUNT = 2

vi.mock('./handlers/index.js', () => ({
  devHomeHandler: vi.fn().mockReturnValue('dev-home-response'),
  demoConfirmationHandler: vi.fn().mockReturnValue('demo-confirmation-response')
}))

describe('dev-tools index', () => {
  let server
  let mockDevHomeHandler
  let mockDemoConfirmationHandler

  beforeEach(async () => {
    vi.clearAllMocks()

    const handlers = await import('./handlers/index.js')
    mockDevHomeHandler = handlers.devHomeHandler
    mockDemoConfirmationHandler = handlers.demoConfirmationHandler

    server = {
      route: vi.fn()
    }
  })

  describe('devTools plugin', () => {
    test('should have correct plugin name', () => {
      expect(devTools.plugin.name).toBe('dev-tools')
    })

    test('should register dev home route', () => {
      devTools.plugin.register(server)

      expect(server.route).toHaveBeenCalledWith({
        method: 'GET',
        path: '/dev',
        options: {
          auth: false
        },
        handler: mockDevHomeHandler
      })
    })

    test('should register demo confirmation route', () => {
      devTools.plugin.register(server)

      expect(server.route).toHaveBeenCalledWith({
        method: 'GET',
        path: '/dev/demo-confirmation/{slug}',
        options: {
          auth: false
        },
        handler: mockDemoConfirmationHandler
      })
    })

    test('should register all routes', () => {
      devTools.plugin.register(server)

      const expectedRouteCount = BASE_ROUTES_COUNT + errorRoutes.length
      expect(server.route).toHaveBeenCalledTimes(expectedRouteCount)
    })

    test('should disable auth for both routes', () => {
      devTools.plugin.register(server)

      const routeCalls = server.route.mock.calls
      routeCalls.forEach((call) => {
        const routeConfig = call[0]
        expect(routeConfig.options.auth).toBe(false)
      })
    })

    // Generate route configurations dynamically from errorRoutes
    const routeConfigurations = [
      { name: 'dev home route', path: '/dev' },
      { name: 'demo confirmation route', path: '/dev/demo-confirmation/{slug}' },
      ...errorRoutes.map(({ code }) => ({
        name: `test ${code} route`,
        path: `/dev/test-${code}`
      }))
    ]

    test.each(routeConfigurations)('should register $name with correct configuration', ({ path }) => {
      devTools.plugin.register(server)

      expect(server.route).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path,
          options: { auth: false }
        })
      )
    })

    test('should handle server registration errors gracefully', () => {
      server.route.mockImplementationOnce(() => {
        throw new Error('Route registration failed')
      })

      expect(() => devTools.plugin.register(server)).toThrow('Route registration failed')
      expect(server.route).toHaveBeenCalledTimes(1)
    })

    test('should register routes in correct order', () => {
      devTools.plugin.register(server)

      const routeCalls = server.route.mock.calls
      expect(routeCalls[0][0].path).toBe('/dev')
      expect(routeCalls[1][0].path).toBe('/dev/demo-confirmation/{slug}')
    })

    test('should use imported handlers', () => {
      devTools.plugin.register(server)

      const routeCalls = server.route.mock.calls
      const devHomeRoute = routeCalls.find((call) => call[0].path === '/dev')
      const demoConfirmationRoute = routeCalls.find((call) => call[0].path === '/dev/demo-confirmation/{slug}')

      expect(devHomeRoute[0].handler).toBe(mockDevHomeHandler)
      expect(demoConfirmationRoute[0].handler).toBe(mockDemoConfirmationHandler)
    })

    test('should handle multiple server registrations', () => {
      const secondServer = { route: vi.fn() }

      devTools.plugin.register(server)
      devTools.plugin.register(secondServer)

      const expectedRouteCount = BASE_ROUTES_COUNT + errorRoutes.length
      expect(server.route).toHaveBeenCalledTimes(expectedRouteCount)
      expect(secondServer.route).toHaveBeenCalledTimes(expectedRouteCount)
    })

    test('should have plugin structure matching Hapi plugin interface', () => {
      expect(devTools).toHaveProperty('plugin')
      expect(devTools.plugin).toHaveProperty('name')
      expect(devTools.plugin).toHaveProperty('register')
      expect(typeof devTools.plugin.register).toBe('function')
    })

    test('should handle missing server object', () => {
      expect(() => devTools.plugin.register(null)).toThrow()
    })

    test('should handle server without route method', () => {
      const invalidServer = {}

      expect(() => devTools.plugin.register(invalidServer)).toThrow()
    })
  })

  describe('plugin exports', () => {
    test('should export devTools as named export', () => {
      expect(devTools).toBeDefined()
      expect(typeof devTools).toBe('object')
    })

    test('should have correct plugin structure', () => {
      expect(devTools.plugin.name).toBe('dev-tools')
      expect(typeof devTools.plugin.register).toBe('function')
    })

    test('devTools should only export plugin property', () => {
      const exportedKeys = Object.keys(devTools)
      expect(exportedKeys).toEqual(['plugin'])
    })

    test('should export errorRoutes array', () => {
      expect(Array.isArray(errorRoutes)).toBe(true)
      expect(errorRoutes.length).toBeGreaterThan(0)
      errorRoutes.forEach((route) => {
        expect(route).toHaveProperty('code')
        expect(route).toHaveProperty('boomMethod')
        expect(route).toHaveProperty('message')
      })
    })
  })
})
