import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockHapiRequest, mockHapiResponseToolkit, mockHapiServer } from '~/src/__mocks__/hapi-mocks.js'

const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()

vi.mock('node:fs', () => ({
  default: {
    existsSync: (...args) => mockExistsSync(...args),
    readFileSync: (...args) => mockReadFileSync(...args)
  },
  existsSync: (...args) => mockExistsSync(...args),
  readFileSync: (...args) => mockReadFileSync(...args)
}))

describe('journey-runner-plugin', () => {
  let server
  let handler
  let onPreResponseExt

  beforeEach(async () => {
    vi.clearAllMocks()

    server = mockHapiServer()

    const { journeyRunnerPlugin } = await import('./journey-runner-plugin.js')
    journeyRunnerPlugin.plugin.register(server)

    onPreResponseExt = server.ext.mock.calls[0][1]
    handler = server.route.mock.calls[0][0].handler
  })

  describe('onPreResponse extension', () => {
    it('should inject journeySlug into view context', () => {
      const request = mockHapiRequest({
        path: '/farm-payments/start',
        response: {
          variety: 'view',
          source: { context: { existing: 'data' } }
        }
      })
      const h = mockHapiResponseToolkit()

      onPreResponseExt(request, h)

      expect(request.response.source.context).toEqual({
        existing: 'data',
        journeySlug: 'farm-payments'
      })
    })

    it('should not modify non-view responses', () => {
      const request = mockHapiRequest({
        path: '/some/path',
        response: { variety: 'plain' }
      })
      const h = mockHapiResponseToolkit()

      const result = onPreResponseExt(request, h)

      expect(result).toBe(h.continue)
    })

    it('should handle empty path', () => {
      const request = mockHapiRequest({
        path: '/',
        response: {
          variety: 'view',
          source: { context: {} }
        }
      })
      const h = mockHapiResponseToolkit()

      onPreResponseExt(request, h)

      expect(request.response.source.context.journeySlug).toBe('')
    })
  })

  describe('route handler', () => {
    it('should register a GET route at /dev/journey-runner/{journey}.js', () => {
      const routeConfig = server.route.mock.calls[0][0]

      expect(routeConfig.method).toBe('GET')
      expect(routeConfig.path).toBe('/dev/journey-runner/{journey}.js')
      expect(routeConfig.options.auth).toBe(false)
    })

    it('should return error comment when engine file does not exist', () => {
      mockExistsSync.mockReturnValue(false)

      const request = mockHapiRequest({ params: { journey: 'test' } })
      const h = mockHapiResponseToolkit()

      handler(request, h)

      expect(h.response).toHaveBeenCalledWith('// journey-runner engine not found')
      expect(h.type).toHaveBeenCalledWith('application/javascript')
      expect(h.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
    })

    it.each([
      ['path traversal', '../evil'],
      ['uppercase letters', 'BadSlug']
    ])('should reject invalid journey slugs (%s)', (_label, slug) => {
      mockExistsSync.mockReturnValue(true)

      const request = mockHapiRequest({ params: { journey: slug } })
      const h = mockHapiResponseToolkit()

      handler(request, h)

      expect(h.response).toHaveBeenCalledWith('// invalid journey slug')
    })

    it('should return not-found comment when journey JSON does not exist', () => {
      mockExistsSync
        .mockReturnValueOnce(true) // engine exists
        .mockReturnValueOnce(false) // journey file does not

      const request = mockHapiRequest({
        params: { journey: 'missing-journey' }
      })
      const h = mockHapiResponseToolkit()

      handler(request, h)

      expect(h.response).toHaveBeenCalledWith('// no journey config for "missing-journey"')
    })

    it('should return combined engine and journey JSON for valid requests', () => {
      mockExistsSync.mockReturnValue(true)
      mockReadFileSync
        .mockReturnValueOnce('[{"slug":"start"}]') // journey JSON
        .mockReturnValueOnce('console.log("engine")') // engine JS

      const request = mockHapiRequest({
        params: { journey: 'farm-payments' }
      })
      const h = mockHapiResponseToolkit()

      handler(request, h)

      expect(h.response).toHaveBeenCalledWith('globalThis.__journeySteps = [{"slug":"start"}];\nconsole.log("engine")')
      expect(h.type).toHaveBeenCalledWith('application/javascript')
      expect(h.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
    })
  })
})
