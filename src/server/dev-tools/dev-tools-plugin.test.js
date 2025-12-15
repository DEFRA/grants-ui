import { vi } from 'vitest'
import { devTools, errorRoutes } from './index.js'

// Number of non-error routes (dev home + demo confirmation + demo details)
const BASE_ROUTES_COUNT = 3

vi.mock('./handlers/index.js', () => ({
  devHomeHandler: vi.fn().mockReturnValue('dev-home-response'),
  demoConfirmationHandler: vi.fn().mockReturnValue('demo-confirmation-response'),
  demoDetailsHandler: vi.fn().mockReturnValue('demo-details-response')
}))

describe('dev-tools index', () => {
  let server
  let mockDevHomeHandler
  let mockDemoConfirmationHandler
  let mockDemoDetailsHandler

  beforeEach(async () => {
    vi.clearAllMocks()

    const handlers = await import('./handlers/index.js')
    mockDevHomeHandler = handlers.devHomeHandler
    mockDemoConfirmationHandler = handlers.demoConfirmationHandler
    mockDemoDetailsHandler = handlers.demoDetailsHandler

    server = {
      route: vi.fn()
    }
  })

  describe('devTools plugin', () => {
    test('should have correct plugin name', () => {
      expect(devTools.plugin.name).toBe('dev-tools')
    })

    const routeConfigurations = [
      {
        name: 'dev home route',
        path: '/dev',
        handler: () => mockDevHomeHandler
      },
      {
        name: 'demo confirmation route',
        path: '/dev/demo-confirmation/{slug}',
        handler: () => mockDemoConfirmationHandler
      },
      {
        name: 'demo details route',
        path: '/dev/demo-details/{slug}',
        handler: () => mockDemoDetailsHandler
      }
    ]

    test.each(routeConfigurations)('should register $name with correct configuration', ({ path, handler }) => {
      devTools.plugin.register(server)

      expect(server.route).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path,
          options: { auth: false },
          handler: handler()
        })
      )
    })

    test('should register all routes including error routes', () => {
      devTools.plugin.register(server)

      const expectedRouteCount = BASE_ROUTES_COUNT + errorRoutes.length
      expect(server.route).toHaveBeenCalledTimes(expectedRouteCount)
    })

    test('should disable auth for all routes', () => {
      devTools.plugin.register(server)

      const routeCalls = server.route.mock.calls
      routeCalls.forEach((call) => {
        const routeConfig = call[0]
        expect(routeConfig.options.auth).toBe(false)
      })
    })

    // Generate route configurations dynamically from errorRoutes
    const errorRouteConfigurations = errorRoutes.map(({ code }) => ({
      name: `test ${code} route`,
      path: `/dev/test-${code}`
    }))

    test.each(errorRouteConfigurations)('should register $name with correct path', ({ path }) => {
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
