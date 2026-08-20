// @ts-nocheck
import { vi } from 'vitest'
import { landGrantsActionsPlugin } from './land-grants-actions.plugin.js'
import { fetchAuthorisedParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'
import {
  fetchActionsWithPlannedActions,
  fetchConsentRequirementsForParcel
} from '~/src/server/land-grants/services/land-grants.service.js'
import { error } from '~/src/server/common/helpers/logging/log.js'

vi.mock('~/src/server/land-grants/services/parcel-cache.js', () => ({
  fetchAuthorisedParcelIds: vi.fn()
}))

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  fetchActionsWithPlannedActions: vi.fn(),
  fetchConsentRequirementsForParcel: vi.fn()
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  error: vi.fn(),
  LogCodes: { LAND_GRANTS: { FETCH_ACTIONS_ERROR: 'FETCH_ACTIONS_ERROR' } }
}))

const AVAILABILITY_PATH = '/api/land-grants/actions/{parcelId}'
const CONSENTS_PATH = '/api/land-grants/actions/{parcelId}/consents'

function makeServer() {
  const routes = []
  return {
    route: vi.fn((r) => routes.push(r)),
    _routes: routes
  }
}

function registerRoutes() {
  const server = makeServer()
  landGrantsActionsPlugin.plugin.register(server)
  return server._routes
}

/** Routes are addressed by path, so adding one never reshuffles the others. */
function routeFor(path) {
  const route = registerRoutes().find((r) => r.path === path)
  if (!route) {
    throw new Error(`no route registered for ${path}`)
  }
  return route
}

function makeRequest({
  parcelId = 'SD7946-0155',
  payload = { plannedActions: [] },
  sbi = '106284736',
  token = 'defra-id-access-token'
} = {}) {
  return {
    params: { parcelId },
    payload,
    auth: { credentials: { sbi, token } }
  }
}

function makeH() {
  const responseObj = { code: vi.fn().mockReturnThis() }
  return {
    response: vi.fn().mockReturnValue(responseObj),
    _responseObj: responseObj
  }
}

describe('landGrantsActionsPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/land-grants/actions/{parcelId}', () => {
    let handler

    beforeEach(() => {
      handler = routeFor(AVAILABILITY_PATH).handler
      vi.clearAllMocks()
    })

    it('registers a session-authed POST route', () => {
      expect(routeFor(AVAILABILITY_PATH)).toMatchObject({
        method: 'POST',
        path: AVAILABILITY_PATH,
        options: expect.objectContaining({ auth: { mode: 'required', strategy: 'session' } })
      })
    })

    it('still validates the plannedActions payload only', () => {
      const { payload } = routeFor(AVAILABILITY_PATH).options.validate

      expect(payload.validate({ plannedActions: [{ actionCode: 'CSAM3', quantity: 1.5, unit: 'ha' }] }).error).toBeUndefined()
      expect(payload.validate({}).error).toBeDefined()
    })

    it('rejects with 403 when the parcel is not in the caller-authorised set', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(['SD1111-0001'])
      const request = makeRequest({ parcelId: 'SD7946-0155' })
      const h = makeH()

      await handler(request, h)

      expect(h.response).toHaveBeenCalledWith()
      expect(h._responseObj.code).toHaveBeenCalledWith(403)
      expect(fetchActionsWithPlannedActions).not.toHaveBeenCalled()
    })

    it('rejects with 403 when the authorised-parcels lookup fails', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(null)
      const request = makeRequest()
      const h = makeH()

      await handler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(403)
      expect(fetchActionsWithPlannedActions).not.toHaveBeenCalled()
    })

    it('returns the recomputed actions for an authorised parcel', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155'])
      const plannedActions = [{ actionCode: 'CSAM3', quantity: 1.5, unit: 'ha' }]
      const apiResult = { actions: [{ code: 'CSAM3', availableArea: { value: 1.5, unit: 'ha' } }] }
      fetchActionsWithPlannedActions.mockResolvedValue(apiResult)
      const request = makeRequest({ parcelId: 'SD7946-0155', payload: { plannedActions } })
      const h = makeH()

      await handler(request, h)

      expect(fetchActionsWithPlannedActions).toHaveBeenCalledWith(
        {
          parcelId: '0155',
          sheetId: 'SD7946',
          plannedActions
        },
        { defraIdToken: 'defra-id-access-token', sbi: '106284736' }
      )
      expect(h.response).toHaveBeenCalledWith(apiResult)
      expect(h._responseObj.code).toHaveBeenCalledWith(200)
    })

    it('passes through the upstream status when it rejects the request as invalid (e.g. quantity exceeds available area)', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155'])
      const upstreamError = Object.assign(new Error('quantity exceeds available area'), { status: 400 })
      fetchActionsWithPlannedActions.mockRejectedValue(upstreamError)
      const request = makeRequest({ parcelId: 'SD7946-0155', sbi: '106284736' })
      const h = makeH()

      await handler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(400)
    })

    it('returns 503 and logs when the upstream call fails', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155'])
      const upstreamError = Object.assign(new Error('upstream down'), { status: 502 })
      fetchActionsWithPlannedActions.mockRejectedValue(upstreamError)
      const request = makeRequest({ parcelId: 'SD7946-0155', sbi: '106284736' })
      const h = makeH()

      await handler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(503)
      expect(error).toHaveBeenCalledWith(
        'FETCH_ACTIONS_ERROR',
        {
          sbi: '106284736',
          sheetId: 'SD7946',
          parcelId: '0155',
          errorMessage: 'upstream down',
          statusCode: 502
        },
        request
      )
    })
  })

  describe('POST /api/land-grants/actions/{parcelId}/consents', () => {
    let handler

    const consentsRequest = (enabledLandActions = ['CSAM3'], overrides = {}) =>
      makeRequest({ payload: { enabledLandActions }, ...overrides })

    beforeEach(() => {
      handler = routeFor(CONSENTS_PATH).handler
      vi.clearAllMocks()
    })

    it('registers a session-authed, crumb-validated POST route', () => {
      expect(routeFor(CONSENTS_PATH)).toMatchObject({
        method: 'POST',
        path: CONSENTS_PATH,
        options: expect.objectContaining({
          auth: { mode: 'required', strategy: 'session' },
          plugins: { crumb: { restful: true } }
        })
      })
    })

    it('validates the parcel id against the compound parcel pattern', () => {
      const { params } = routeFor(CONSENTS_PATH).options.validate

      expect(params.validate({ parcelId: 'SD7946-0155' }).error).toBeUndefined()
      expect(params.validate({ parcelId: 'not-a-parcel' }).error).toBeDefined()
    })

    it('accepts an empty enabledLandActions array but rejects a missing or duplicated one', () => {
      const { payload } = routeFor(CONSENTS_PATH).options.validate

      expect(payload.validate({ enabledLandActions: [] }).error).toBeUndefined()
      expect(payload.validate({ enabledLandActions: ['CSAM3', 'CLIG3'] }).error).toBeUndefined()
      expect(payload.validate({}).error).toBeDefined()
      expect(payload.validate({ enabledLandActions: ['CSAM3', 'CSAM3'] }).error).toBeDefined()
    })

    it.each([
      ['neither requirement', [], []],
      ['a HEFER only', ['hefer'], ['hefer']],
      ['SSSI consent only', ['sssi'], ['sssi']],
      ['both, on different actions', ['sssi', 'hefer'], ['sssi', 'hefer']]
    ])('returns %s as %j', async (_label, consents, expected) => {
      fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155'])
      fetchConsentRequirementsForParcel.mockResolvedValue({ consents })
      const h = makeH()

      await handler(consentsRequest(), h)

      expect(h.response).toHaveBeenCalledWith({ consents: expected })
      expect(h._responseObj.code).toHaveBeenCalledWith(200)
    })

    it('passes the caller-supplied action codes through as display filtering only', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155'])
      fetchConsentRequirementsForParcel.mockResolvedValue({ consents: [] })
      const h = makeH()

      await handler(consentsRequest(['CSAM3', 'CLIG3']), h)

      expect(fetchConsentRequirementsForParcel).toHaveBeenCalledWith(
        { parcelId: '0155', sheetId: 'SD7946', enabledLandActions: ['CSAM3', 'CLIG3'] },
        { defraIdToken: 'defra-id-access-token', sbi: '106284736' }
      )
    })

    it('rejects with 403 when the parcel is not in the caller-authorised set', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(['SD1111-0001'])
      const h = makeH()

      await handler(consentsRequest(), h)

      expect(h._responseObj.code).toHaveBeenCalledWith(403)
      expect(fetchConsentRequirementsForParcel).not.toHaveBeenCalled()
    })

    it('rejects with 403 when the authorised-parcels lookup fails', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(null)
      const h = makeH()

      await handler(consentsRequest(), h)

      expect(h._responseObj.code).toHaveBeenCalledWith(403)
      expect(fetchConsentRequirementsForParcel).not.toHaveBeenCalled()
    })

    it('passes through the upstream status when it rejects the request as invalid', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155'])
      fetchConsentRequirementsForParcel.mockRejectedValue(
        Object.assign(new Error('bad parcel'), { status: 400 })
      )
      const h = makeH()

      await handler(consentsRequest(), h)

      expect(h._responseObj.code).toHaveBeenCalledWith(400)
    })

    it('returns 503 and logs when the upstream call fails', async () => {
      fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155'])
      fetchConsentRequirementsForParcel.mockRejectedValue(
        Object.assign(new Error('upstream down'), { status: 502 })
      )
      const request = consentsRequest()
      const h = makeH()

      await handler(request, h)

      expect(h._responseObj.code).toHaveBeenCalledWith(503)
      expect(error).toHaveBeenCalledWith(
        'FETCH_ACTIONS_ERROR',
        {
          sbi: '106284736',
          sheetId: 'SD7946',
          parcelId: '0155',
          errorMessage: 'upstream down',
          statusCode: 502
        },
        request
      )
    })
  })
})
