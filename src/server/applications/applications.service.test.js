import { beforeEach, expect, it, vi } from 'vitest'
import { saveApplicationResumePath } from './applications.service.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
vi.mock('../common/helpers/forms-cache/forms-cache.js', () => ({ getFormsCacheService: vi.fn() }))
vi.mock('../common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: { SYSTEM: { APPLICATION_RESUME_SAVE_FAILED: {} } }
}))
const definition = { metadata: { allowMultipleApplications: true }, pages: [{ path: '/tasks' }] }
let request
let h
beforeEach(() => {
  vi.clearAllMocks()
  request = {
    method: 'get',
    route: { realm: { plugin: '@defra/forms-engine-plugin' } },
    params: { slug: 'example' },
    app: {},
    server: {}
  }
  h = { continue: Symbol('continue') }
})
it('persists the next journey destination after a successful POST', async () => {
  request.method = 'post'
  request.params.path = 'project-details'
  request.app.model = { def: definition }
  request.response = { statusCode: 303, headers: { location: '/example/tasks' } }
  const cache = {
    getState: vi.fn().mockResolvedValue({ $$__referenceNumber: 'REF-A', answer: 'saved' }),
    setState: vi.fn()
  }
  getFormsCacheService.mockReturnValue(cache)
  await saveApplicationResumePath(request, h)
  expect(cache.setState).toHaveBeenCalledWith(request, {
    $$__referenceNumber: 'REF-A',
    answer: 'saved',
    lastSavedPath: '/tasks'
  })
})

it('does not alter single-application journeys', async () => {
  request.method = 'post'
  request.app.model = { def: { ...definition, metadata: {} } }
  request.response = { statusCode: 303, headers: { location: '/example/tasks' } }
  expect(await saveApplicationResumePath(request, h)).toBe(h.continue)
  expect(getFormsCacheService).not.toHaveBeenCalled()
})
it('does not save an external redirect or an unsuccessful POST', async () => {
  request.method = 'post'
  request.app.model = { def: definition }
  request.response = { statusCode: 400, headers: { location: '/example/tasks' } }
  await saveApplicationResumePath(request, h)
  request.response = { statusCode: 303, headers: { location: 'https://other.invalid/elsewhere' } }
  await saveApplicationResumePath(request, h)
  expect(getFormsCacheService).not.toHaveBeenCalled()
})

it('does not save resume metadata after submission', async () => {
  request.method = 'post'
  request.app.model = { def: definition }
  request.response = { statusCode: 303, headers: { location: '/example/tasks' } }
  const cache = { getState: vi.fn().mockResolvedValue({ applicationStatus: 'SUBMITTED' }), setState: vi.fn() }
  getFormsCacheService.mockReturnValue(cache)
  await saveApplicationResumePath(request, h)
  expect(cache.setState).not.toHaveBeenCalled()
})

it('preserves the successful response when auxiliary resume persistence fails', async () => {
  request.method = 'post'
  request.app.model = { def: definition }
  request.response = { statusCode: 303, headers: { location: '/example/tasks' } }
  getFormsCacheService.mockReturnValue({
    getState: vi.fn().mockResolvedValue({ answer: 'saved' }),
    setState: vi.fn().mockRejectedValue(new Error('Unavailable'))
  })
  expect(await saveApplicationResumePath(request, h)).toBe(h.continue)
  expect(request.response.statusCode).toBe(303)
})
