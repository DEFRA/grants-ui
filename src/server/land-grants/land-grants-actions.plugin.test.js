// @ts-nocheck
import { vi } from 'vitest'
import { landGrantsActionsPlugin } from './land-grants-actions.plugin.js'
import { fetchAuthorisedParcelIds } from '~/src/server/land-grants/services/parcel-cache.js'
import { fetchActionsWithPlannedActions } from '~/src/server/land-grants/services/land-grants.service.js'
import { error } from '~/src/server/common/helpers/logging/log.js'
import { UNIT_TYPES } from '~/src/shared/unit-types.js'
import { USER_CONTEXT } from '~/src/server/land-grants/test-helpers.js'

vi.mock('~/src/server/land-grants/services/parcel-cache.js', () => ({
  fetchAuthorisedParcelIds: vi.fn()
}))

vi.mock('~/src/server/land-grants/services/land-grants.service.js', () => ({
  fetchActionsWithPlannedActions: vi.fn()
}))

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  error: vi.fn(),
  LogCodes: { LAND_GRANTS: { FETCH_ACTIONS_ERROR: 'FETCH_ACTIONS_ERROR' } }
}))

function makeServer() {
  const routes = []
  return {
    route: vi.fn((r) => routes.push(r)),
    _routes: routes
  }
}

function makeRequest({
  parcelId = 'SD7946-0155',
  plannedActions = [],
  sbi = USER_CONTEXT.sbi,
  token = USER_CONTEXT.defraIdToken
} = {}) {
  return {
    params: { parcelId },
    payload: { plannedActions },
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
  let route
  let handler

  const validatePlannedActionUnit = (unit) =>
    route.options.validate.payload.validate({ plannedActions: [{ actionCode: 'UPL1', quantity: 5, unit }] }).error

  beforeEach(() => {
    const server = makeServer()
    landGrantsActionsPlugin.plugin.register(server)
    route = server._routes[0]
    handler = route.handler
    vi.clearAllMocks()
  })

  it('registers a session-authed POST route', () => {
    expect(route).toMatchObject({
      method: 'POST',
      path: '/api/land-grants/actions/{parcelId}',
      options: expect.objectContaining({ auth: { mode: 'required', strategy: 'session' } })
    })
  })

  it.each(UNIT_TYPES)('accepts %s as a planned action unit', (unit) => {
    expect(validatePlannedActionUnit(unit)).toBeUndefined()
  })

  it('rejects a planned action unit the API never reports', () => {
    expect(validatePlannedActionUnit('furlong')).toBeDefined()
  })

  it.each([
    ['the parcel is not in the caller-authorised set', ['SD1111-0001']],
    ['the authorised-parcels lookup fails', null]
  ])('rejects with 403 when %s', async (_case, authorisedParcelIds) => {
    fetchAuthorisedParcelIds.mockResolvedValue(authorisedParcelIds)
    const request = makeRequest({ parcelId: 'SD7946-0155' })
    const h = makeH()

    await handler(request, h)

    expect(h.response).toHaveBeenCalledWith()
    expect(h._responseObj.code).toHaveBeenCalledWith(403)
    expect(fetchActionsWithPlannedActions).not.toHaveBeenCalled()
  })

  it('returns the recomputed actions for an authorised parcel', async () => {
    fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155'])
    const plannedActions = [{ actionCode: 'CSAM3', quantity: 1.5, unit: 'ha' }]
    const apiResult = { actions: [{ code: 'CSAM3', availability: { value: 1.5, unit: 'ha' } }] }
    fetchActionsWithPlannedActions.mockResolvedValue(apiResult)
    const request = makeRequest({ parcelId: 'SD7946-0155', plannedActions })
    const h = makeH()

    await handler(request, h)

    expect(fetchActionsWithPlannedActions).toHaveBeenCalledWith(
      {
        parcelId: '0155',
        sheetId: 'SD7946',
        plannedActions
      },
      USER_CONTEXT
    )
    expect(h.response).toHaveBeenCalledWith(apiResult)
    expect(h._responseObj.code).toHaveBeenCalledWith(200)
  })

  it('passes through the upstream status when it rejects the request as invalid (e.g. quantity exceeds available area)', async () => {
    fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155'])
    const upstreamError = Object.assign(new Error('quantity exceeds available area'), { status: 400 })
    fetchActionsWithPlannedActions.mockRejectedValue(upstreamError)
    const request = makeRequest({ parcelId: 'SD7946-0155' })
    const h = makeH()

    await handler(request, h)

    expect(h._responseObj.code).toHaveBeenCalledWith(400)
  })

  it('returns 503 and logs when the upstream call fails', async () => {
    fetchAuthorisedParcelIds.mockResolvedValue(['SD7946-0155'])
    const upstreamError = Object.assign(new Error('upstream down'), { status: 502 })
    fetchActionsWithPlannedActions.mockRejectedValue(upstreamError)
    const request = makeRequest({ parcelId: 'SD7946-0155' })
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
