import { it, expect, vi, beforeEach } from 'vitest'
import { listApplicationsRoute, startApplicationRoute } from './applications.route.js'
import { listApplicationsFromApi } from '../common/helpers/state/fetch-saved-state-helper.js'
import { getStateWithDefinition } from '../common/helpers/state/state-with-definition-context.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { setReferenceNumber } from '../common/helpers/state/get-cache-key-helper.js'
import { isApplicationWindowOpen } from '../common/helpers/application-window.js'

vi.mock('../common/helpers/state/fetch-saved-state-helper.js', () => ({ listApplicationsFromApi: vi.fn() }))
vi.mock('../common/helpers/auth/get-auth-identifiers.js', () => ({
  getAuthenticatedCrn: vi.fn(() => 'crn-1'),
  getAuthenticatedSbi: vi.fn(() => 'sbi-1')
}))
vi.mock('../common/helpers/state/state-with-definition-context.js', () => ({
  getStateWithDefinition: vi.fn(),
  resolveVersion: vi.fn(() => '1.0.0')
}))
vi.mock('../common/helpers/forms-cache/forms-cache.js', () => ({ getFormsCacheService: vi.fn() }))
vi.mock('../common/helpers/state/get-cache-key-helper.js', () => ({
  setReferenceNumber: vi.fn()
}))
vi.mock('../common/helpers/application-window.js', () => ({ isApplicationWindowOpen: vi.fn() }))
const definition = {
  name: 'Test grant',
  metadata: { allowMultipleApplications: true },
  startPage: '/start',
  pages: []
}
let request
let h
let cache
beforeEach(() => {
  vi.clearAllMocks()
  request = { params: { slug: 'test-grant' }, app: {}, yar: { clear: vi.fn() }, server: {} }
  h = { view: vi.fn(), redirect: vi.fn().mockReturnThis(), code: vi.fn().mockReturnThis() }
  cache = { setState: vi.fn() }
  getFormsCacheService.mockReturnValue(cache)
  getStateWithDefinition.mockResolvedValue({ definition: { definition } })
  listApplicationsFromApi.mockResolvedValue([])
  isApplicationWindowOpen.mockReturnValue(true)
})
it('lists the current business and grant with reference links and meaningful statuses', async () => {
  listApplicationsFromApi.mockResolvedValue([
    { applicationRef: 'REF-1', applicationStatus: null },
    { applicationRef: 'REF-2', applicationStatus: 'SUBMITTED' },
    { applicationRef: 'REF-3', applicationStatus: 'REOPENED' }
  ])
  await listApplicationsRoute.handler(request, h)
  expect(listApplicationsFromApi).toHaveBeenCalledWith({ crn: 'crn-1', sbi: 'sbi-1', grantCode: 'test-grant' })
  expect(h.view).toHaveBeenCalledWith(
    'applications',
    expect.objectContaining({
      schemeName: 'Test grant',
      canStartApplication: true,
      applications: [
        expect.objectContaining({
          referenceNumber: 'REF-1',
          statusText: 'Draft',
          actionText: 'Continue application',
          href: '/test-grant?ref=REF-1'
        }),
        expect.objectContaining({
          statusText: 'Submitted',
          actionText: 'View application',
          href: '/test-grant/print-submitted-application?ref=REF-2'
        }),
        expect.objectContaining({ statusText: 'Returned for amendments' })
      ]
    })
  )
})
it('creates a fresh reference without copying the existing application or clearing authentication', async () => {
  await startApplicationRoute.handler(request, h)
  const state = cache.setState.mock.calls[0][1]
  expect(cache.setState.mock.calls[0][2]).toEqual({ failOnError: true })
  expect(Object.keys(state)).toEqual(['$$__referenceNumber'])
  expect(state.$$__referenceNumber).toBeTruthy()
  expect(setReferenceNumber).toHaveBeenCalledWith(request, state.$$__referenceNumber)
  expect(h.redirect).toHaveBeenCalledWith(`/test-grant/start?ref=${encodeURIComponent(state.$$__referenceNumber)}`)
  expect(h.code).toHaveBeenCalledWith(303)
  expect(request.yar.clear).not.toHaveBeenCalledWith('sbi')
})
it('does not select a reference when persistence fails', async () => {
  cache.setState.mockRejectedValue(new Error('Backend unavailable'))
  await expect(startApplicationRoute.handler(request, h)).rejects.toThrow('Backend unavailable')
  expect(setReferenceNumber).toHaveBeenCalledExactlyOnceWith(request)
  expect(h.redirect).not.toHaveBeenCalled()
})
it('blocks selector and creation for single-application grants', async () => {
  getStateWithDefinition.mockResolvedValue({ definition: { definition: { metadata: {} } } })
  for (const route of [listApplicationsRoute, startApplicationRoute]) {
    await expect(route.handler(request, h)).rejects.toMatchObject({ details: { status: 404 } })
  }
  expect(cache.setState).not.toHaveBeenCalled()
  expect(listApplicationsFromApi).not.toHaveBeenCalled()
})
it('blocks creation when the application window is closed', async () => {
  isApplicationWindowOpen.mockReturnValue(false)
  await startApplicationRoute.handler(request, h)
  expect(cache.setState).not.toHaveBeenCalled()
  expect(h.redirect).toHaveBeenCalledWith('/test-grant/application-window-closed')
})

it('uses the scheme short name and configured support email on the selector', async () => {
  getStateWithDefinition.mockResolvedValue({
    definition: {
      definition: {
        ...definition,
        metadata: { ...definition.metadata, shortName: 'Water Management grant', supportEmail: 'support@example.test' }
      }
    }
  })
  await listApplicationsRoute.handler(request, h)
  expect(h.view).toHaveBeenCalledWith(
    'applications',
    expect.objectContaining({
      pageTitle: 'Your Water Management grant applications',
      serviceName: 'Water Management grant',
      supportEmail: 'support@example.test'
    })
  )
})

it.each(['CLAIM_STARTED', 'CLAIM_SUBMITTED'])(
  'shows %s as Submitted with a claim link to the grant root',
  async (applicationStatus) => {
    listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1', applicationStatus }])
    await listApplicationsRoute.handler(request, h)
    expect(h.view).toHaveBeenCalledWith(
      'applications',
      expect.objectContaining({
        applications: [
          expect.objectContaining({ statusText: 'Submitted', actionText: 'View claim', href: '/test-grant?ref=REF-1' })
        ]
      })
    )
  }
)
it('keeps selector creation available without granular role checks', async () => {
  getStateWithDefinition.mockResolvedValue({
    definition: {
      definition: {
        ...definition,
        metadata: { ...definition.metadata, permissions: { enforce: true, resource: 'csApplications' } }
      }
    }
  })
  request.can = vi.fn(() => false)
  await listApplicationsRoute.handler(request, h)
  expect(h.view).toHaveBeenCalledWith('applications', expect.objectContaining({ canStartApplication: true }))
  await startApplicationRoute.handler(request, h)
  expect(cache.setState).toHaveBeenCalledTimes(1)
  expect(request.can).not.toHaveBeenCalled()
})
