import { vi } from 'vitest'

export const mockApiEndpoint = 'https://land-grants-api'
const CACHE_TTL_MINUTES = 5
export const CACHE_TTL_MS = CACHE_TTL_MINUTES * 60 * 1000 // must match parcel-cache.js CACHE_TTL_MS
export const landGrantsApiConfigDefaults = { defaults: { 'landGrants.grantsServiceApiEndpoint': mockApiEndpoint } }
export const landGrantsClientMockOverrides = {
  calculate: vi.fn(),
  parcelsGroups: vi.fn(),
  parcelsWithSize: vi.fn(),
  parcelsWithGroups: vi.fn(),
  parcelsWithActions: vi.fn(),
  locateParcelTiles: vi.fn(),
  validate: vi.fn()
}
export const enabledLandActions = ['CMOR1', 'UPL1', 'UPL2', 'UPL3', 'UPL8', 'UPL10', 'CLIG3']
export const mockUserContext = {
  defraIdToken: 'defra-id-access-token',
  sbi: '123456789'
}
export const withUserContext =
  (fn) =>
  (...args) =>
    fn(...args, mockUserContext)

export const apiCMOR1 = {
  code: 'CMOR1',
  availability: { value: 10.5, unit: 'ha' },
  description: 'Assess moorland and produce a written record'
}
export const mappedCMOR1 = { ...apiCMOR1, description: 'Assess moorland and produce a written record: CMOR1' }
export const parcelResponse = (actions, groups) => ({
  parcels: [{ parcelId: 'PARCEL456', sheetId: 'SHEET123', size: { value: 50.5, unit: 'ha' }, actions }],
  ...(groups && { groups })
})
