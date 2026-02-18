import { vi } from 'vitest'
import { devTools, errorRoutes } from './index.js'

vi.mock('./handlers/index.js', () => ({
  devHomeHandler: vi.fn().mockReturnValue('dev-home-response'),
  demoConfirmationHandler: vi.fn().mockReturnValue('demo-confirmation-response'),
  demoDetailsHandler: vi.fn().mockReturnValue('demo-details-response'),
  demoDetailsPostHandler: vi.fn().mockReturnValue('demo-details-post-response')
}))

describe('dev-tools index', () => {
  let server
  let mockDevHomeHandler
  let mockDemoConfirmationHandler
  let mockDemoDetailsHandler
  let mockDemoDetailsPostHandler

  beforeEach(async () => {
    vi.clearAllMocks()

    const handlers = await import('./handlers/index.js')
    mockDevHomeHandler = handlers.devHomeHandler
    mockDemoConfirmationHandler = handlers.demoConfirmationHandler
    mockDemoDetailsHandler = handlers.demoDetailsHandler
    mockDemoDetailsPostHandler = handlers.demoDetailsPostHandler

    server = {
      route: vi.fn()
    }
  })

  describe('devTools plugin', () => {
    const routeConfigurations = [
      {
        name: 'dev home route',
        method: 'GET',
        path: '/dev',
        handler: () => mockDevHomeHandler
      },
      {
        name: 'demo confirmation route',
        method: 'GET',
        path: '/dev/demo-confirmation/{slug}',
        handler: () => mockDemoConfirmationHandler
      },
      {
        name: 'demo details GET route',
        method: 'GET',
        path: '/dev/demo-details/{slug}',
        handler: () => mockDemoDetailsHandler
      },
      {
        name: 'demo details POST route',
        method: 'POST',
        path: '/dev/demo-details/{slug}',
        handler: () => mockDemoDetailsPostHandler
      }
    ]

    test.each(routeConfigurations)('should register $name with correct configuration', ({ method, path, handler }) => {
      devTools.plugin.register(server)

      expect(server.route).toHaveBeenCalledWith(
        expect.objectContaining({
          method,
          path,
          options: { auth: false },
          handler: handler()
        })
      )
    })

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
  })
})
