// @ts-nocheck
import { vi } from 'vitest'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import { setupControllerMocks } from '~/src/__mocks__/controller-mocks.js'
import { formatParcelReference, parseLandParcel, stringifyParcel } from '~/src/shared/format-parcel.js'

export const CMOR1 = {
  code: 'CMOR1',
  description: 'Assess moorland and produce a written record: CMOR1',
  availability: { unit: 'ha', value: 10 },
  ratePerUnitGbp: 16,
  ratePerAgreementPerYearGbp: 272
}

export const UPL1 = {
  code: 'UPL1',
  description: 'Moderate livestock grazing on moorland: UPL1',
  availability: { unit: 'ha', value: 5 },
  ratePerUnitGbp: 33
}

export const UPL2 = {
  code: 'UPL2',
  description: 'Heavy livestock grazing on moorland: UPL2',
  availability: { unit: 'ha', value: 3 },
  ratePerUnitGbp: 45
}

/** The credentials the controllers forward to the land-grants service. */
export const USER_CONTEXT = { defraIdToken: 'defra-id-access-token', sbi: '106284736' }

/** What `fetchParcels` resolves with for an authenticated caller. */
export const PARCELS_WITH_SIZE = [
  { parcelId: '0155', sheetId: 'SD7946', area: { unit: 'ha', value: 4.0383 } },
  { parcelId: '4509', sheetId: 'SD7846', area: { unit: 'sqm', value: 0.0633 } }
]

/**
 * A Hapi request as the land-grants controllers see it, post-authentication.
 * @param {Record<string, unknown>} [overrides] merged over the defaults
 */
export const makeLandGrantsRequest = (overrides = {}) => ({
  query: {},
  logger: mockRequestLogger(),
  auth: {
    isAuthenticated: true,
    credentials: {
      token: USER_CONTEXT.defraIdToken,
      sbi: USER_CONTEXT.sbi,
      crn: 'CRN123',
      name: 'John Doe',
      organisationName: 'Farm 1',
      role: 'admin',
      sessionId: 'valid-session-id'
    }
  },
  ...overrides
})

/** @param {string} [renderedView] value `h.view` resolves to */
export const makeViewToolkit = (renderedView = 'rendered view') => ({
  view: vi.fn().mockReturnValue(renderedView),
  redirect: vi.fn()
})

/**
 * Replace the base-class methods a land-grants page controller inherits, so a
 * test can drive the handler without a real forms-engine model behind it.
 * @param {object} controller
 * @param {{ proceed?: string, nextPath?: string }} [options]
 */
export const stubControllerMethods = (controller, options = {}) => {
  setupControllerMocks(controller, { proceed: 'redirected', nextPath: '/next-path', ...options })
  controller.collection = { getErrors: vi.fn().mockReturnValue([]) }
  controller.performAuthCheck = vi.fn().mockResolvedValue(null)
  return controller
}

/**
 * Give the auto-mocked `~/src/shared/format-parcel.js` its real-ish behaviour.
 * Requires the calling test to have `vi.mock`ed that module.
 * @param {{ sheetId?: string, parcelId?: string }} [parsedAs] what `parseLandParcel` returns
 */
export const mockFormatParcelImplementations = ({ sheetId = 'sheet1', parcelId = 'parcel1' } = {}) => {
  parseLandParcel.mockReturnValue([sheetId, parcelId])
  stringifyParcel.mockImplementation((parcel) => `${parcel.sheetId}-${parcel.parcelId}`)
  formatParcelReference.mockImplementation((parcel) => {
    const [sheet, id] = typeof parcel === 'string' ? parcel.split('-') : [parcel.sheetId, parcel.parcelId]
    return [sheet, id].filter((part) => part != null && part !== '').join(' ')
  })
}
