// @ts-nocheck
import { vi } from 'vitest'
import {
  fetchGroupedActionsForParcel as fetchGroupedActionsForParcelService,
  fetchActionsForParcel as fetchActionsForParcelService,
  fetchConsentRequirementsForParcel as fetchConsentRequirementsForParcelService
} from '~/src/server/land-grants/services/land-grants.service.js'
import { parcelsWithGroups, parcelsWithActions } from '~/src/server/land-grants/services/land-grants.client.js'
import { clearParcelCache } from '~/src/server/land-grants/services/parcel-cache.js'
import { configState } from '~/src/__mocks__/config-mocks.js'
import {
  apiCMOR1,
  mappedCMOR1,
  parcelResponse,
  mockApiEndpoint,
  enabledLandActions,
  mockUserContext,
  withUserContext
} from './land-grants.service.test-helpers.js'

const fetchFlat = (enabled = enabledLandActions) =>
  fetchActionsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions: enabled })
const fetchGrouped = (enabled = enabledLandActions) =>
  fetchGroupedActionsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions: enabled })
const fetchGroupedActionsForParcel = withUserContext(fetchGroupedActionsForParcelService)
const fetchActionsForParcel = withUserContext(fetchActionsForParcelService)
const fetchConsentRequirementsForParcel = withUserContext(fetchConsentRequirementsForParcelService)

vi.mock('~/src/server/land-grants/services/land-grants.client.js', async (importOriginal) => {
  const { landGrantsClientMockOverrides } = await import('./land-grants.service.test-helpers.js')
  return { ...(await importOriginal()), ...landGrantsClientMockOverrides }
})

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigWithState } = await import('~/src/__mocks__/config-mocks.js')
  const { landGrantsApiConfigDefaults } = await import('./land-grants.service.test-helpers.js')
  return mockConfigWithState(landGrantsApiConfigDefaults)
})

describe('land-grants service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchActionsForParcel', () => {
    beforeEach(() => {
      clearParcelCache()
      configState.reset()
    })

    it('should fetch a flat action list for a parcel, filtered by enabledLandActions', async () => {
      const mockApiResponse = parcelResponse([
        apiCMOR1,
        {
          code: 'UNKNOWN1',
          availability: { value: 5.0, unit: 'ha' },
          description: 'description'
        }
      ])
      parcelsWithActions.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchFlat()

      expect(parcelsWithActions).toHaveBeenCalledWith(['SHEET123-PARCEL456'], mockApiEndpoint, mockUserContext, [])
      expect(result).toEqual({
        parcel: {
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123',
          size: { value: 50.5, unit: 'ha', unitFullName: 'hectares' }
        },
        actions: [mappedCMOR1]
      })
    })

    it('should sort enabled actions alphabetically by description', async () => {
      parcelsWithActions.mockResolvedValueOnce(
        parcelResponse([
          { code: 'UPL2', description: 'Supplementary winter feeding' },
          { code: 'UNKNOWN1', description: 'A disabled action' },
          { code: 'CMOR1', description: 'Assess moorland and produce a written record' },
          { code: 'UPL1', description: 'Moderate livestock grazing on moorland' }
        ])
      )

      const result = await fetchFlat()

      expect(result.actions.map(({ description }) => description)).toEqual([
        'Assess moorland and produce a written record: CMOR1',
        'Moderate livestock grazing on moorland: UPL1',
        'Supplementary winter feeding: UPL2'
      ])
    })

    it.each(['partial', 'total', undefined])(
      'should pass availability.type through unchanged when it is %s',
      async (type) => {
        const mockApiResponse = parcelResponse([
          {
            code: 'CSAM3',
            availability: { value: 10.5, unit: 'ha', ...(type !== undefined && { type }) },
            description: 'Herbal leys'
          }
        ])
        parcelsWithActions.mockResolvedValueOnce(mockApiResponse)

        const result = await fetchFlat(['CSAM3'])

        expect(result.actions[0].availability).toEqual({ value: 10.5, unit: 'ha', ...(type !== undefined && { type }) })
      }
    )

    it('should pass a null availability value through unchanged', async () => {
      const mockApiResponse = parcelResponse([
        {
          code: 'CSAM3',
          availability: { value: null, unit: 'ha', type: 'partial' },
          description: 'Herbal leys'
        }
      ])
      parcelsWithActions.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchFlat(['CSAM3'])

      expect(result.actions[0].availability).toEqual({ value: null, unit: 'ha', type: 'partial' })
    })

    it('should return no actions when enabledLandActions is empty', async () => {
      const mockApiResponse = parcelResponse([apiCMOR1])
      parcelsWithActions.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchFlat([])

      expect(result.actions).toEqual([])
    })

    it('should return empty array when parcel not found', async () => {
      const mockApiResponse = {
        parcels: [{ parcelId: 'OTHER_PARCEL', sheetId: 'OTHER_SHEET', actions: [] }]
      }
      parcelsWithActions.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchFlat()

      expect(result).toEqual({
        parcel: {
          sheetId: 'SHEET123',
          parcelId: 'PARCEL456',
          size: { unit: '', value: 0, unitFullName: '' }
        },
        actions: []
      })
    })
  })

  describe('fetchActionsForParcel caching', () => {
    const mockApiResponse = parcelResponse([apiCMOR1])

    beforeEach(() => {
      clearParcelCache()
      configState.reset()
      parcelsWithActions.mockResolvedValue(mockApiResponse)
    })

    it('should cache the result and not call parcelsWithActions again for the same parcel/enabledLandActions', async () => {
      await fetchActionsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions })
      await fetchActionsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions })

      expect(parcelsWithActions).toHaveBeenCalledTimes(1)
    })

    it('should bypass the cache when plannedActions is given', async () => {
      const plannedActions = [{ actionCode: 'CMOR1', quantity: 2, unit: 'ha' }]

      await fetchActionsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions, plannedActions })
      await fetchActionsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions, plannedActions })

      expect(parcelsWithActions).toHaveBeenCalledTimes(2)
    })

    it('should not collide with fetchGroupedActionsForParcel cache entries for the same parcel/enabledLandActions', async () => {
      const groupedApiResponse = { ...mockApiResponse, groups: [{ name: 'Assess moorland', actions: ['CMOR1'] }] }
      parcelsWithGroups.mockResolvedValueOnce(groupedApiResponse)

      const flatResult = await fetchActionsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions })
      const groupedResult = await fetchGrouped()

      expect(parcelsWithActions).toHaveBeenCalledTimes(1)
      expect(parcelsWithGroups).toHaveBeenCalledTimes(1)
      expect(Array.isArray(flatResult.actions)).toBe(true)
      expect(Array.isArray(groupedResult.actions[0]?.actions)).toBe(true)
    })
  })

  describe('fetchConsentRequirementsForParcel', () => {
    beforeEach(() => {
      clearParcelCache()
      configState.reset()
      configState.set('landGrants.enableSSSIFeature', true)
      configState.set('landGrants.enableHeferFeature', true)
    })

    it.each([
      ['neither requirement', [{ code: 'CMOR1', description: 'Assess moorland' }], []],
      ['a HEFER only', [{ code: 'CMOR1', description: 'Assess moorland', heferRequired: true }], ['hefer']],
      ['SSSI consent only', [{ code: 'CMOR1', description: 'Assess moorland', sssiConsentRequired: true }], ['sssi']],
      [
        'both flags across different actions',
        [
          { code: 'UPL1', description: 'Moderate grazing', heferRequired: true },
          { code: 'CMOR1', description: 'Assess moorland', sssiConsentRequired: true }
        ],
        ['sssi', 'hefer']
      ]
    ])('should return the consents for %s', async (_label, actions, expected) => {
      parcelsWithActions.mockResolvedValueOnce(parcelResponse(actions))

      const result = await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(result).toEqual({ consents: expected })
    })

    it('should report consents for actions no journey enables', async () => {
      parcelsWithActions.mockResolvedValueOnce(
        parcelResponse([
          { code: 'CMOR1', description: 'Assess moorland', sssiConsentRequired: true },
          { code: 'UPL2', description: 'Supplementary winter feeding', heferRequired: true }
        ])
      )

      const result = await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(result).toEqual({ consents: ['sssi', 'hefer'] })
    })

    it('should ask the API for the parcel without narrowing to any action list', async () => {
      parcelsWithActions.mockResolvedValueOnce(parcelResponse([{ code: 'CMOR1', description: 'Assess moorland' }]))

      await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(parcelsWithActions).toHaveBeenCalledWith(['SHEET123-PARCEL456'], mockApiEndpoint, mockUserContext, [])
    })

    it('should omit a key whose feature flag is off, even when the action has the field set', async () => {
      configState.set('landGrants.enableHeferFeature', false)
      parcelsWithActions.mockResolvedValueOnce(
        parcelResponse([
          { code: 'CMOR1', description: 'Assess moorland', sssiConsentRequired: true, heferRequired: true }
        ])
      )

      const result = await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(result).toEqual({ consents: ['sssi'] })
    })

    it('should cache its own unfiltered lookup rather than calling upstream twice', async () => {
      parcelsWithActions.mockResolvedValue(
        parcelResponse([{ code: 'CMOR1', description: 'Assess moorland', sssiConsentRequired: true }])
      )

      await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })
      const result = await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(parcelsWithActions).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ consents: ['sssi'] })
    })

    it('should not collide with the journey-filtered cache entry for the same parcel', async () => {
      parcelsWithActions.mockResolvedValue(
        parcelResponse([
          { code: 'CMOR1', description: 'Assess moorland', sssiConsentRequired: true },
          { code: 'UNKNOWN1', description: 'A disabled action', heferRequired: true }
        ])
      )

      const filtered = await fetchActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123',
        enabledLandActions: ['CMOR1']
      })
      const result = await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(filtered.actions.map((a) => a.code)).toEqual(['CMOR1'])
      expect(parcelsWithActions).toHaveBeenCalledTimes(2)
      expect(result).toEqual({ consents: ['sssi', 'hefer'] })
    })

    it('should propagate an upstream failure to the caller', async () => {
      parcelsWithActions.mockRejectedValueOnce(new Error('upstream down'))

      await expect(fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })).rejects.toThrow(
        'upstream down'
      )
    })
  })
})
