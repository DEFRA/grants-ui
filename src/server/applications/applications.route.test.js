import { it, expect, vi, beforeEach } from 'vitest'
import { listApplicationsRoute, startApplicationRoute } from './applications.route.js'
import {
  fetchLatestDefinitionFromApi,
  listApplicationsFromApi
} from '../common/helpers/state/fetch-saved-state-helper.js'
import { getRoutingDefinition } from '../common/helpers/definition/routing-definition.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { setReferenceNumber } from '../common/helpers/state/get-cache-key-helper.js'
import { isApplicationWindowOpen } from '../common/helpers/application-window.js'
import { readGasStatuses } from './services/gas-status.service.js'
import agreements from '~/src/config/agreements.js'
import { loadSharedRedirectRules } from '../common/forms/services/form.js'

vi.mock('../common/helpers/state/fetch-saved-state-helper.js', () => ({
  listApplicationsFromApi: vi.fn(),
  fetchLatestDefinitionFromApi: vi.fn()
}))
vi.mock('../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})
vi.mock('./services/gas-status.service.js', () => ({ readGasStatuses: vi.fn() }))
vi.mock('../common/forms/services/form.js', () => ({
  loadSharedRedirectRules: vi.fn(),
  mergeGrantRedirectRules: vi.fn((grantRules, sharedRules) => ({ ...sharedRules, ...grantRules }))
}))
vi.mock('../common/helpers/auth/get-auth-identifiers.js', () => ({
  getAuthenticatedCrn: vi.fn(() => 'crn-1'),
  getAuthenticatedSbi: vi.fn(() => 'sbi-1')
}))
vi.mock('../common/helpers/state/state-with-definition-context.js', () => ({
  resolveVersion: vi.fn(() => '1.0.0')
}))
vi.mock('../common/helpers/definition/routing-definition.js', () => ({ getRoutingDefinition: vi.fn() }))
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
const sharedRedirectRules = {
  postSubmission: [
    {
      fromGrantsStatus: 'SUBMITTED,REOPENED',
      gasStatus: 'APPLICATION_WITHDRAWN',
      toGrantsStatus: 'CLEARED',
      toPath: '/start'
    },
    { fromGrantsStatus: 'SUBMITTED', gasStatus: 'APPLICATION_AMEND', toGrantsStatus: 'REOPENED', toPath: '/summary' },
    {
      fromGrantsStatus: 'SUBMITTED',
      gasStatus: 'OFFER_SENT,OFFER_WITHDRAWN,OFFER_ACCEPTED',
      toGrantsStatus: 'SUBMITTED',
      toPath: agreements.get('baseUrl')
    },
    { fromGrantsStatus: 'default', gasStatus: 'default', toGrantsStatus: 'SUBMITTED', toPath: '/confirmation' }
  ]
}
let request
let h
let cache
beforeEach(() => {
  vi.clearAllMocks()
  request = { params: { slug: 'test-grant' }, app: {}, yar: { clear: vi.fn() }, server: {} }
  h = {
    view: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    code: vi.fn().mockReturnThis()
  }
  cache = { setState: vi.fn() }
  getFormsCacheService.mockReturnValue(cache)
  getRoutingDefinition.mockResolvedValue({ definition: { major: 1, definition } })
  listApplicationsFromApi.mockResolvedValue([])
  fetchLatestDefinitionFromApi.mockResolvedValue(null)
  readGasStatuses.mockResolvedValue(new Map())
  loadSharedRedirectRules.mockResolvedValue(sharedRedirectRules)
  isApplicationWindowOpen.mockReturnValue(true)
})
it('lists the current business and grant with grant-root links and meaningful statuses', async () => {
  const applications = [
    { applicationRef: 'REF-1', applicationStatus: null },
    { applicationRef: 'REF-2', applicationStatus: 'SUBMITTED', pinnedMajor: 1, submittedAt: '2026-03-01T12:00:00Z' },
    { applicationRef: 'REF-3', applicationStatus: 'REOPENED', submittedAt: '2026-02-01T12:00:00Z' }
  ]
  listApplicationsFromApi.mockResolvedValue(applications)
  await listApplicationsRoute.handler(request, h)
  expect(listApplicationsFromApi).toHaveBeenCalledWith({ crn: 'crn-1', sbi: 'sbi-1', grantCode: 'test-grant' })
  // only the submitted application is checked against GAS
  expect(readGasStatuses).toHaveBeenCalledWith(request, 'test-grant', [applications[1]])
  expect(h.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
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
          submittedAt: '2026-03-01T12:00:00Z',
          href: '/test-grant?ref=REF-2'
        }),
        expect.objectContaining({
          statusText: 'Returned for amendments',
          actionText: 'Continue application',
          submittedAt: null,
          href: '/test-grant?ref=REF-3'
        })
      ]
    })
  )
})

it('shows a submitted application GAS has returned for amendments as returned, without writing anything', async () => {
  listApplicationsFromApi.mockResolvedValue([
    { applicationRef: 'REF-1', applicationStatus: 'SUBMITTED', pinnedMajor: 1, submittedAt: '2026-03-01T12:00:00Z' }
  ])
  readGasStatuses.mockResolvedValue(new Map([['REF-1', 'APPLICATION_AMEND']]))
  await listApplicationsRoute.handler(request, h)
  expect(h.view).toHaveBeenCalledWith(
    'applications',
    expect.objectContaining({
      applications: [
        expect.objectContaining({
          referenceNumber: 'REF-1',
          statusText: 'Returned for amendments',
          actionText: 'Continue application',
          submittedAt: null,
          href: '/test-grant?ref=REF-1'
        })
      ]
    })
  )
  expect(cache.setState).not.toHaveBeenCalled()
  expect(listApplicationsFromApi).toHaveBeenCalledTimes(1)
})

it.each([
  ['RECEIVED', '/test-grant/print-submitted-application?ref=REF-1'],
  ['OFFER_SENT', '/test-grant?ref=REF-1'],
  ['APPLICATION_WITHDRAWN', '/test-grant?ref=REF-1']
])(
  'keeps a submitted application as Submitted when GAS answers %s and links it to %s: only a confirmed submission opens as its print view',
  async (gasStatus, href) => {
    listApplicationsFromApi.mockResolvedValue([
      { applicationRef: 'REF-1', applicationStatus: 'SUBMITTED', pinnedMajor: 1, submittedAt: '2026-03-01T12:00:00Z' }
    ])
    readGasStatuses.mockResolvedValue(new Map([['REF-1', gasStatus]]))
    await listApplicationsRoute.handler(request, h)
    expect(h.view).toHaveBeenCalledWith(
      'applications',
      expect.objectContaining({
        applications: [
          expect.objectContaining({
            statusText: 'Submitted',
            actionText: 'View application',
            submittedAt: '2026-03-01T12:00:00Z',
            href
          })
        ]
      })
    )
  }
)

it("reads the GAS answer through the grant's own post-submission rules when it overrides the shared ones", async () => {
  getRoutingDefinition.mockResolvedValue({
    definition: {
      major: 1,
      definition: {
        ...definition,
        metadata: {
          ...definition.metadata,
          grantRedirectRules: {
            postSubmission: [
              { fromGrantsStatus: 'SUBMITTED', gasStatus: 'SENT_BACK', toGrantsStatus: 'REOPENED', toPath: '/tasks' }
            ]
          }
        }
      }
    }
  })
  listApplicationsFromApi.mockResolvedValue([
    { applicationRef: 'REF-1', applicationStatus: 'SUBMITTED', pinnedMajor: 1 },
    { applicationRef: 'REF-2', applicationStatus: 'SUBMITTED', pinnedMajor: 1 }
  ])
  readGasStatuses.mockResolvedValue(
    new Map([
      ['REF-1', 'SENT_BACK'],
      ['REF-2', 'APPLICATION_AMEND']
    ])
  )
  await listApplicationsRoute.handler(request, h)
  expect(h.view).toHaveBeenCalledWith(
    'applications',
    expect.objectContaining({
      applications: [
        expect.objectContaining({ referenceNumber: 'REF-1', statusText: 'Returned for amendments' }),
        expect.objectContaining({ referenceNumber: 'REF-2', statusText: 'Submitted' })
      ]
    })
  )
})
it("reads each submitted application's GAS answer under the rules of its own grant major, read once per other major", async () => {
  const sentBackReopens = {
    fromGrantsStatus: 'SUBMITTED',
    gasStatus: 'SENT_BACK',
    toGrantsStatus: 'REOPENED',
    toPath: '/tasks'
  }
  getRoutingDefinition.mockResolvedValue({
    definition: {
      major: 2,
      definition: {
        ...definition,
        metadata: { ...definition.metadata, grantRedirectRules: { postSubmission: [sentBackReopens] } }
      }
    }
  })
  // Major 1 never overrode the shared rules: SENT_BACK is not a return there, APPLICATION_AMEND is.
  fetchLatestDefinitionFromApi.mockResolvedValue({ major: 1, definition: { metadata: {} } })
  listApplicationsFromApi.mockResolvedValue([
    { applicationRef: 'REF-1', applicationStatus: 'SUBMITTED', pinnedMajor: 1, grantVersion: '1.4.2' },
    { applicationRef: 'REF-2', applicationStatus: 'SUBMITTED', pinnedMajor: 1, grantVersion: '1.3.0' },
    { applicationRef: 'REF-3', applicationStatus: 'SUBMITTED', pinnedMajor: 2, grantVersion: '2.0.0' }
  ])
  readGasStatuses.mockResolvedValue(
    new Map([
      ['REF-1', 'SENT_BACK'],
      ['REF-2', 'APPLICATION_AMEND'],
      ['REF-3', 'SENT_BACK']
    ])
  )
  await listApplicationsRoute.handler(request, h)
  expect(fetchLatestDefinitionFromApi).toHaveBeenCalledTimes(1)
  expect(fetchLatestDefinitionFromApi).toHaveBeenCalledWith('test-grant', { major: 1 })
  expect(h.view).toHaveBeenCalledWith(
    'applications',
    expect.objectContaining({
      applications: [
        expect.objectContaining({
          referenceNumber: 'REF-1',
          statusText: 'Submitted',
          href: '/test-grant/print-submitted-application?ref=REF-1'
        }),
        expect.objectContaining({
          referenceNumber: 'REF-2',
          statusText: 'Returned for amendments',
          href: '/test-grant?ref=REF-2'
        }),
        expect.objectContaining({
          referenceNumber: 'REF-3',
          statusText: 'Returned for amendments',
          href: '/test-grant?ref=REF-3'
        })
      ]
    })
  )
})

it.each([
  ['the definition of its major cannot be read', { pinnedMajor: 0 }],
  ['the backend lists it without a pinned major', {}]
])(
  "labels a submitted application under the selector's own rules, linked to the grant root, when %s",
  async (_, pinning) => {
    fetchLatestDefinitionFromApi.mockRejectedValue(new Error('backend down'))
    listApplicationsFromApi.mockResolvedValue([
      { applicationRef: 'REF-1', applicationStatus: 'SUBMITTED', submittedAt: '2026-03-01T12:00:00Z', ...pinning },
      { applicationRef: 'REF-2', applicationStatus: 'SUBMITTED', submittedAt: '2026-03-01T12:00:00Z', ...pinning }
    ])
    readGasStatuses.mockResolvedValue(
      new Map([
        ['REF-1', 'APPLICATION_AMEND'],
        ['REF-2', 'RECEIVED']
      ])
    )
    await listApplicationsRoute.handler(request, h)
    expect(readGasStatuses.mock.calls[0][2]).toHaveLength(2)
    expect(h.view).toHaveBeenCalledWith(
      'applications',
      expect.objectContaining({
        applications: [
          expect.objectContaining({
            referenceNumber: 'REF-1',
            statusText: 'Returned for amendments',
            actionText: 'Continue application',
            href: '/test-grant?ref=REF-1'
          }),
          // Confirmed submitted only under rules that may not be its own: no direct print view, the redirect decides.
          expect.objectContaining({
            referenceNumber: 'REF-2',
            statusText: 'Submitted',
            actionText: 'View application',
            href: '/test-grant?ref=REF-2'
          })
        ]
      })
    )
  }
)

it('creates a fresh reference without copying the existing application or clearing authentication', async () => {
  await startApplicationRoute.handler(request, h)
  const state = cache.setState.mock.calls[0][1]
  expect(cache.setState.mock.calls[0][2]).toEqual({ failOnError: true, allowMultipleApplications: true })
  expect(Object.keys(state)).toEqual(['$$__referenceNumber'])
  expect(state.$$__referenceNumber).toBeTruthy()
  expect(setReferenceNumber).toHaveBeenCalledWith(request, state.$$__referenceNumber)
  expect(h.redirect).toHaveBeenCalledWith(`/test-grant?ref=${encodeURIComponent(state.$$__referenceNumber)}`)
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
  getRoutingDefinition.mockResolvedValue({ definition: { definition: { metadata: {} } } })
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
  getRoutingDefinition.mockResolvedValue({
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
  getRoutingDefinition.mockResolvedValue({
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

it('does not manufacture form state or a form model when displaying the selector', async () => {
  await listApplicationsRoute.handler(request, h)
  expect(request.app.model).toBeUndefined()
  expect(request.app.stateWithDefinition).toBeUndefined()
  expect(isApplicationWindowOpen).toHaveBeenCalledWith(request, definition)
})

it('does not create links for application records with missing references', async () => {
  listApplicationsFromApi.mockResolvedValue([
    { applicationRef: undefined },
    { applicationRef: null },
    { applicationRef: '' },
    { applicationRef: 'REF-VALID' }
  ])
  await listApplicationsRoute.handler(request, h)
  expect(h.view).toHaveBeenCalledWith(
    'applications',
    expect.objectContaining({
      applications: [expect.objectContaining({ href: '/test-grant?ref=REF-VALID' })]
    })
  )
})
