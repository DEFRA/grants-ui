import Wreck from '@hapi/wreck'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import { AUTH_SESSION_VERSION } from '~/src/plugins/auth.js'
import { fetchAllowedGrants } from '~/src/server/auth/services/allowlist.client.js'
import { fetchBusinessPermissions } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import { fetchLatestDefinitionFromApi } from '~/src/server/common/helpers/state/fetch-saved-state-helper.js'
import { createServer } from '~/src/server/index.js'

vi.hoisted(() => {
  process.env.DEFRA_ID_CLIENT_ID = 'test-client-id'
  process.env.SHUTTER_ENABLED_SLUGS = 'woodland'
  process.env.SHUTTER_ENABLED_CONTENT_WOODLAND = '<p class="govuk-body" id="back-soon">Back on Monday.</p>'
})

vi.unmock('~/src/server/index.js')

vi.mock('hapi-pino', async () => {
  const { mockHapiPino } = await import('~/src/__mocks__')
  const hapiPino = mockHapiPino()
  return { default: hapiPino, ...hapiPino }
})

vi.mock('@defra/forms-engine-plugin', () => ({
  default: { plugin: { name: 'forms-engine-plugin', register: vi.fn() } }
}))

vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () => ({
  QuestionPageController: class {}
}))

vi.mock('@defra/forms-engine-plugin/controllers/TerminalPageController.js', () => ({
  TerminalPageController: class {}
}))

vi.mock('~/src/server/common/forms/services/forms-redis.js', () => ({
  getFormsRedisClient: vi.fn(() => ({ status: 'ready' })),
  setFormMeta: vi.fn(async () => {}),
  setSlugReverse: vi.fn(async () => {}),
  setAllSlugs: vi.fn(async () => {}),
  getFormMeta: vi.fn(async () => null),
  getSlugByFormId: vi.fn(async () => null),
  getAllSlugs: vi.fn(async () => []),
  getAllFormMetas: vi.fn(async () => [])
}))

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', async (importActual) => ({
  ...(await importActual()),
  fetchBusinessPermissions: vi.fn()
}))

vi.mock('~/src/server/auth/services/allowlist.client.js', async (importActual) => ({
  ...(await importActual()),
  fetchAllowedGrants: vi.fn()
}))

vi.mock('~/src/server/common/helpers/state/fetch-saved-state-helper.js', async (importActual) => ({
  ...(await importActual()),
  fetchLatestDefinitionFromApi: vi.fn()
}))

describe('shutter in the server', () => {
  let server
  const handler = vi.fn(() => 'saved')
  const auth = {
    strategy: 'session',
    credentials: { version: AUTH_SESSION_VERSION, contactId: 'contact-1', crn: '1100000000', sbi: '106000000' }
  }

  beforeAll(async () => {
    Wreck.get.mockResolvedValue({
      payload: { authorization_endpoint: 'https://mock-auth/authorize', token_endpoint: 'https://mock-auth/token' }
    })
    fetchLatestDefinitionFromApi.mockResolvedValue({ definition: { name: 'Woodland Management Plan' } })
    server = await createServer()
    server.route({ method: 'GET', path: '/{slug}/{path}', handler })
    await server.initialize()
  })

  afterAll(() => server.stop({ timeout: 0 }))

  test('renders the shutter page before permissions, the allowlist or the route are reached', async () => {
    const { statusCode, payload } = await server.inject({ method: 'GET', url: '/woodland/start', auth })

    expect(statusCode).toBe(503)
    expect(payload).toContain('Sorry, Woodland Management Plan is unavailable')
    expect(payload).toContain('id="back-soon"')
    expect(payload).toContain('Farm and Land service')
    expect(fetchBusinessPermissions).not.toHaveBeenCalled()
    expect(fetchAllowedGrants).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  test('sends a signed-out user to sign in', async () => {
    const { statusCode, headers } = await server.inject({ method: 'GET', url: '/woodland/start' })

    expect(statusCode).toBe(302)
    expect(headers.location).toContain('/auth/sign-in')
  })
})
