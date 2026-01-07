import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Hapi from '@hapi/hapi'
import inert from '@hapi/inert'
import { serveStaticFiles } from './serve-static-files.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      const values = {
        staticCacheTimeout: 3600000,
        assetPath: '/public'
      }
      return values[key]
    })
  }
}))

describe('#serveStaticFiles', () => {
  let server

  beforeEach(async () => {
    server = Hapi.server({ port: 0 })
    await server.register(inert)
    await server.register(serveStaticFiles)
    await server.initialize()
  })

  afterEach(async () => {
    await server.stop()
  })

  it('should return 204 No Content for favicon.ico', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/favicon.ico'
    })

    expect(response.statusCode).toBe(statusCodes.noContent)
    expect(response.headers['content-type']).toBe('image/x-icon')
  })

  it.each([
    { path: '/javascripts/application.min.js', description: 'javascript' },
    { path: '/assets/{path*}', description: 'assets' },
    { path: '/public/{param*}', description: 'public assets' },
    { path: '/favicon.ico', description: 'favicon' }
  ])('should register $description route at $path', async ({ path }) => {
    const table = server.table()
    const route = table.find((r) => r.path === path)

    expect(route).toBeDefined()
    expect(route.method).toBe('get')
  })
})
