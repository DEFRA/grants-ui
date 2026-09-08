import Hapi from '@hapi/hapi'
import { unauthorized } from '@hapi/boom'
import { vi } from 'vitest'
import { agreements } from './index.js'
import { getAgreementController } from './controller.js'
import { enforceAgreementPermission } from './permissions.js'
import permissions from '~/src/plugins/permissions.js'
import { fetchBusinessPermissions } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { catchAll } from '~/src/server/common/helpers/errors.js'
import { nunjucksConfig } from '~/src/config/nunjucks/nunjucks.js'
import { config } from '~/src/config/config.js'

vi.mock('./controller.js', () => ({
  getAgreementController: { handler: vi.fn(() => 'Agreements journey') }
}))

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchBusinessPermissions: vi.fn()
}))

vi.mock('~/src/config/nunjucks/context/context.js', () => ({
  context: () => ({ getAssetPath: (assetPath) => `/public/${assetPath}` })
}))

const AGREEMENTS_GROUP = 'COUNTRYSIDE_STEWARDSHIP_AGREEMENTS'
const APPLICATIONS_GROUP = 'COUNTRYSIDE_STEWARDSHIP_APPLICATIONS'
const baseUrl = String(config.get('agreements.baseUrl'))
const routes = ['GET', 'POST'].flatMap((method) =>
  [baseUrl, `${baseUrl}/`, `${baseUrl}/offer/accept`].map((url) => ({ method, url }))
)

describe('Agreements route permissions', () => {
  let server

  beforeEach(async () => {
    vi.clearAllMocks()
    fetchBusinessPermissions.mockResolvedValue([])

    server = Hapi.server()
    server.auth.scheme('test-session', () => ({
      authenticate: (_request, h) => h.unauthenticated(unauthorized())
    }))
    server.auth.strategy('session', 'test-session')
    await server.register([permissions, nunjucksConfig, agreements])
    server.ext('onPreResponse', catchAll)
    server.route({ method: 'GET', path: '/unrelated', handler: () => 'Unrelated page' })
    await server.initialize()
  })

  afterEach(async () => {
    await server.stop()
  })

  function inject(route) {
    return server.inject({
      ...route,
      auth: { strategy: 'session', credentials: { crn: 'test-crn', sbi: 'test-sbi' } },
      ...(route.method === 'POST'
        ? { headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'accepted=true' }
        : {})
    })
  }

  describe.each(routes)('$method $url', (route) => {
    it('reaches the proxy with csAgreements Submit permission', async () => {
      fetchBusinessPermissions.mockResolvedValue([{ id: AGREEMENTS_GROUP, level: 'SUBMIT' }])

      const response = await inject(route)

      expect(response.statusCode).toBe(200)
      expect(response.payload).toBe('Agreements journey')
      expect(getAgreementController.handler).toHaveBeenCalledOnce()
    })

    it.each([
      ['View', [{ id: AGREEMENTS_GROUP, level: 'VIEW' }]],
      ['Amend', [{ id: AGREEMENTS_GROUP, level: 'AMEND' }]],
      ['unknown', [{ id: AGREEMENTS_GROUP, level: 'UNKNOWN' }]],
      ['missing', []],
      ['application Submit only', [{ id: APPLICATIONS_GROUP, level: 'SUBMIT' }]]
    ])('renders the standard permission page for %s permissions', async (_label, groups) => {
      fetchBusinessPermissions.mockResolvedValue(groups)

      const response = await inject(route)

      expect(response.statusCode).toBe(403)
      expect(response.headers['content-type']).toContain('text/html')
      expect(response.payload).toContain('You do not have permission to view this page')
      expect(getAgreementController.handler).not.toHaveBeenCalled()
    })

    it('requires an authenticated session', async () => {
      const response = await server.inject(route)

      expect(response.statusCode).toBe(401)
      expect(fetchBusinessPermissions).not.toHaveBeenCalled()
      expect(getAgreementController.handler).not.toHaveBeenCalled()
    })
  })

  it('does not apply agreement permissions to unrelated routes', async () => {
    const response = await inject({ method: 'GET', url: '/unrelated' })

    expect(response.statusCode).toBe(200)
    expect(response.payload).toBe('Unrelated page')
  })

  it('denies access if the permission checker is unavailable', () => {
    expect(() => enforceAgreementPermission({}, { continue: Symbol('continue') })).toThrow(
      expect.objectContaining({ output: expect.objectContaining({ statusCode: 403 }) })
    )
  })
})
