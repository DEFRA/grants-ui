import { vi } from 'vitest'
import { mockHapiServer, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      switch (key) {
        case 'staticCacheTimeout':
          return 86400000
        case 'assetPath':
          return '/public'
        default:
          return undefined
      }
    })
  }
}))

const { serveStaticFiles } = await import('./serve-static-files.js')

describe('serveStaticFiles Plugin', () => {
  let server
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()
    server = mockHapiServer()
    mockH = mockHapiResponseToolkit()
  })

  describe('/favicon.ico route handler', () => {
    test('should return 204 No Content with image/x-icon type', () => {
      serveStaticFiles.plugin.register(server)

      const routes = server.route.mock.calls[0][0]
      const faviconRoute = routes.find((r) => r.path === '/favicon.ico')

      faviconRoute.handler({}, mockH)

      expect(mockH.response).toHaveBeenCalledWith()
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.noContent)
      expect(mockH.type).toHaveBeenCalledWith('image/x-icon')
    })
  })

  describe('/img/{param*} route handler', () => {
    test('should return empty SVG with 200 OK', () => {
      serveStaticFiles.plugin.register(server)

      const routes = server.route.mock.calls[0][0]
      const imgRoute = routes.find((r) => r.path === '/img/{param*}')

      imgRoute.handler({}, mockH)

      const expectedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"></svg>'
      expect(mockH.response).toHaveBeenCalledWith(expectedSvg)
      expect(mockH.code).toHaveBeenCalledWith(statusCodes.ok)
      expect(mockH.type).toHaveBeenCalledWith('image/svg+xml')
    })
  })
})
