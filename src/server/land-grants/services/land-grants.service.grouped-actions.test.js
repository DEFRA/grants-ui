// @ts-nocheck
import { vi } from 'vitest'
import { fetchGroupedActionsForParcel as fetchGroupedActionsForParcelService } from '~/src/server/land-grants/services/land-grants.service.js'
import { parcelsWithGroups } from '~/src/server/land-grants/services/land-grants.client.js'
import { clearParcelCache } from '~/src/server/land-grants/services/parcel-cache.js'
import { configState } from '~/src/__mocks__/config-mocks.js'
import {
  apiCMOR1,
  mappedCMOR1,
  parcelResponse,
  mockApiEndpoint,
  enabledLandActions,
  mockUserContext,
  withUserContext,
  CACHE_TTL_MS
} from './land-grants.service.test-helpers.js'

const apiUPL8 = {
  code: 'UPL8',
  availability: { value: 12.0, unit: 'ha' },
  description: 'Shepherding livestock on moorland'
}
const apiUPL10 = {
  code: 'UPL10',
  availability: { value: 8.0, unit: 'ha' },
  description: 'Shepherding livestock on moorland'
}
const fetchGrouped = (enabled = enabledLandActions) =>
  fetchGroupedActionsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions: enabled })
const moorlandAndShepherdingGroups = [
  { name: 'Assess moorland', actions: ['CMOR1'] },
  { name: 'Shepherding livestock on moorland', actions: ['UPL8', 'UPL10'] }
]
const fetchGroupedActionsForParcel = withUserContext(fetchGroupedActionsForParcelService)

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

  describe('fetchGroupedActionsForParcel', () => {
    beforeEach(() => {
      clearParcelCache()
      configState.reset()
      configState.set('landGrants.enableSSSIFeature', false)
    })

    it('should fetch and group available actions for a parcel successfully', async () => {
      const mockApiResponse = parcelResponse(
        [
          apiCMOR1,
          {
            code: 'UPL1',
            availability: { value: 20.75, unit: 'ha' },
            description: 'Moderate livestock grazing on moorland'
          },
          {
            code: 'UPL2',
            availability: { value: 15.25, unit: 'ha' },
            description: 'Moderate livestock grazing on moorland'
          }
        ],
        [
          { name: 'Assess moorland', actions: ['CMOR1'] },
          { name: 'Livestock grazing on moorland', actions: ['UPL1', 'UPL2', 'UPL3'] }
        ]
      )
      parcelsWithGroups.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchGrouped()

      expect(parcelsWithGroups).toHaveBeenCalledWith(['SHEET123-PARCEL456'], mockApiEndpoint, mockUserContext, [])

      expect(result).toEqual({
        parcel: {
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123',
          size: { value: 50.5, unit: 'ha', unitFullName: 'hectares' }
        },
        actions: [
          {
            name: 'Assess moorland',
            consents: [],
            totalAvailableArea: {
              unit: 'ha',
              unitFullName: 'hectares',
              value: 10.5
            },
            actions: [mappedCMOR1]
          },
          {
            name: 'Livestock grazing on moorland',
            consents: [],
            totalAvailableArea: {
              unit: 'ha',
              unitFullName: 'hectares',
              value: 20.75
            },
            actions: [
              {
                code: 'UPL1',
                availability: { value: 20.75, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL1'
              },
              {
                code: 'UPL2',
                availability: { value: 15.25, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL2'
              }
            ]
          }
        ]
      })
    })

    it.each([
      ['not present', undefined],
      ['empty', []]
    ])('should return no actions when enabledLandActions is %s', async (_case, enabled) => {
      parcelsWithGroups.mockResolvedValueOnce(
        parcelResponse([apiCMOR1], [{ name: 'Assess moorland', actions: ['CMOR1'] }])
      )

      const result = await fetchGroupedActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123',
        enabledLandActions: enabled
      })

      expect(result.actions).toEqual([])
    })

    it('should exclude actions not in any backend group', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
            size: { value: 30.0, unit: 'ha' },
            actions: [
              apiCMOR1,
              {
                code: 'UNKNOWN1',
                availability: { value: 5.0, unit: 'ha' },
                description: 'description'
              },
              {
                code: 'UNKNOWN2',
                availability: { value: 3.5, unit: 'ha' },
                description: 'description'
              }
            ]
          }
        ],
        groups: [
          { name: 'Assess moorland', actions: ['CMOR1'] },
          { name: 'Livestock grazing on moorland', actions: ['UPL1', 'UPL2', 'UPL3'] }
        ]
      }

      parcelsWithGroups.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchGrouped()

      expect(result).toEqual({
        parcel: {
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123',
          size: { value: 30.0, unit: 'ha', unitFullName: 'hectares' }
        },
        actions: [
          {
            name: 'Assess moorland',
            consents: [],
            totalAvailableArea: {
              unit: 'ha',
              unitFullName: 'hectares',
              value: 10.5
            },
            actions: [mappedCMOR1]
          }
        ]
      })
    })

    it('should handle empty parcel parameters', async () => {
      const mockApiResponse = { parcels: [], groups: [] }

      parcelsWithGroups.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchGroupedActionsForParcel({})

      expect(parcelsWithGroups).toHaveBeenCalledWith(['-'], mockApiEndpoint, mockUserContext, [])
      expect(result).toEqual({
        parcel: {
          sheetId: '',
          parcelId: '',
          size: { unit: '', value: 0, unitFullName: '' }
        },
        actions: []
      })
    })

    it('should return empty array when parcel not found', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'OTHER_PARCEL',
            sheetId: 'OTHER_SHEET',
            actions: []
          }
        ],
        groups: [{ name: 'Assess moorland', actions: ['CMOR1'] }]
      }

      parcelsWithGroups.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchGrouped()

      expect(result).toEqual({
        parcel: {
          sheetId: 'SHEET123',
          parcelId: 'PARCEL456',
          size: { unit: '', value: 0, unitFullName: '' }
        },
        actions: []
      })
    })

    it('should return empty array when parcel has no actions', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
            size: { value: 10.0, unit: 'ha' },
            actions: []
          }
        ],
        groups: [{ name: 'Assess moorland', actions: ['CMOR1'] }]
      }

      parcelsWithGroups.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchGrouped()

      expect(result).toEqual({
        parcel: {
          sheetId: 'SHEET123',
          parcelId: 'PARCEL456',
          size: { value: 10.0, unit: 'ha', unitFullName: 'hectares' }
        },
        actions: []
      })
    })

    it('should use maximum value when multiple actions have different areas', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
            size: { value: 40.0, unit: 'ha' },
            actions: [
              {
                code: 'UPL1',
                availability: { value: 15.0, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland'
              },
              {
                code: 'UPL2',
                availability: { value: 25.5, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland'
              },
              {
                code: 'UPL3',
                availability: { value: 10.0, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland'
              }
            ]
          }
        ],
        groups: [{ name: 'Livestock grazing on moorland', actions: ['UPL1', 'UPL2', 'UPL3'] }]
      }

      parcelsWithGroups.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchGrouped()

      expect(result).toEqual({
        parcel: {
          sheetId: 'SHEET123',
          parcelId: 'PARCEL456',
          size: { value: 40.0, unit: 'ha', unitFullName: 'hectares' }
        },
        actions: [
          {
            name: 'Livestock grazing on moorland',
            consents: [],
            totalAvailableArea: {
              unit: 'ha',
              unitFullName: 'hectares',
              value: 25.5
            },
            actions: [
              {
                code: 'UPL1',
                availability: { value: 15.0, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL1'
              },
              {
                code: 'UPL2',
                availability: { value: 25.5, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL2'
              },
              {
                code: 'UPL3',
                availability: { value: 10.0, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL3'
              }
            ]
          }
        ]
      })
    })

    it('should handle API errors', async () => {
      parcelsWithGroups.mockRejectedValueOnce(new Error('API error'))

      await expect(
        fetchGroupedActionsForParcel({
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123'
        })
      ).rejects.toThrow('API error')
    })

    it('should trim spaces from enabledLandActions entries and still match action codes', async () => {
      parcelsWithGroups.mockResolvedValueOnce(parcelResponse([apiCMOR1, apiUPL8], moorlandAndShepherdingGroups))

      const result = await fetchGrouped([' CMOR1 ', ' UPL8 ', ' UPL10 '])

      expect(result.actions).toHaveLength(2)
      expect(result.actions[0].name).toBe('Assess moorland')
      expect(result.actions[1].name).toBe('Shepherding livestock on moorland')
    })

    it('should exclude UPL8 and UPL10 actions when they are not in enabledLandActions', async () => {
      parcelsWithGroups.mockResolvedValueOnce(
        parcelResponse([apiCMOR1, apiUPL8, apiUPL10], moorlandAndShepherdingGroups)
      )

      const result = await fetchGrouped(['CMOR1'])

      expect(result.actions).toEqual([
        {
          name: 'Assess moorland',
          consents: [],
          totalAvailableArea: { unit: 'ha', unitFullName: 'hectares', value: 10.5 },
          actions: [mappedCMOR1]
        }
      ])
    })

    it('should build a group total from only the actions that carry a limit', async () => {
      const mockApiResponse = parcelResponse(
        [
          {
            code: 'UPL8',
            availability: { value: null, unit: 'ha', type: 'partial' },
            description: 'No restriction'
          },
          { code: 'UPL10', availability: { value: 8, unit: 'm' }, description: 'Shepherding livestock' }
        ],
        [{ name: 'Shepherding livestock on moorland', actions: ['UPL8', 'UPL10'] }]
      )
      parcelsWithGroups.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchGrouped(['UPL8', 'UPL10'])

      expect(result.actions[0].totalAvailableArea).toEqual({ unit: 'm', unitFullName: 'metres', value: 8 })
    })

    it('should leave the group total absent when no action in the group has a limit', async () => {
      const mockApiResponse = parcelResponse(
        [
          {
            code: 'UPL8',
            availability: { value: null, unit: 'ha', type: 'partial' },
            description: 'No restriction'
          }
        ],
        [{ name: 'Shepherding livestock on moorland', actions: ['UPL8'] }]
      )
      parcelsWithGroups.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchGrouped(['UPL8'])

      // A null value means "no restriction", not "nothing available" - reporting
      // 0 here would tell the user the exact opposite of the truth.
      expect(result.actions[0].totalAvailableArea).toEqual({ unit: 'ha', unitFullName: 'hectares', value: undefined })
    })

    it('should group UPL8 and UPL10 actions under Shepherding livestock on moorland', async () => {
      parcelsWithGroups.mockResolvedValueOnce(
        parcelResponse([apiCMOR1, apiUPL8, apiUPL10], moorlandAndShepherdingGroups)
      )

      const result = await fetchGrouped(['CMOR1', 'UPL8', 'UPL10'])

      expect(result.actions).toEqual([
        {
          name: 'Assess moorland',
          consents: [],
          totalAvailableArea: { unit: 'ha', unitFullName: 'hectares', value: 10.5 },
          actions: [mappedCMOR1]
        },
        {
          name: 'Shepherding livestock on moorland',
          consents: [],
          totalAvailableArea: { unit: 'ha', unitFullName: 'hectares', value: 12.0 },
          actions: [
            {
              code: 'UPL8',
              availability: { value: 12.0, unit: 'ha' },
              description: 'Shepherding livestock on moorland: UPL8'
            },
            {
              code: 'UPL10',
              availability: { value: 8.0, unit: 'ha' },
              description: 'Shepherding livestock on moorland: UPL10'
            }
          ]
        }
      ])
    })

    describe('V2 - SSSI Consent required flag is enabled', () => {
      beforeEach(() => {
        configState.reset()
        configState.set('landGrants.enableSSSIFeature', true)
      })

      it('should fetch and group available actions for a parcel successfully', async () => {
        const mockApiResponse = parcelResponse(
          [
            {
              code: 'CMOR1',
              availability: { value: 10.5, unit: 'ha' },
              description: 'Assess moorland and produce a written record',
              sssiConsentRequired: false
            },
            {
              code: 'UPL1',
              availability: { value: 20.75, unit: 'ha' },
              description: 'Moderate livestock grazing on moorland',
              sssiConsentRequired: false
            },
            {
              code: 'UPL2',
              availability: { value: 15.25, unit: 'ha' },
              description: 'Moderate livestock grazing on moorland',
              sssiConsentRequired: true
            }
          ],
          [
            { name: 'Assess moorland', actions: ['CMOR1'] },
            { name: 'Livestock grazing on moorland', actions: ['UPL1', 'UPL2', 'UPL3'] }
          ]
        )
        parcelsWithGroups.mockResolvedValueOnce(mockApiResponse)

        const result = await fetchGrouped()

        expect(parcelsWithGroups).toHaveBeenCalledWith(['SHEET123-PARCEL456'], mockApiEndpoint, mockUserContext, [])

        expect(result).toEqual({
          parcel: {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
            size: { value: 50.5, unit: 'ha', unitFullName: 'hectares' }
          },
          actions: [
            {
              name: 'Assess moorland',
              totalAvailableArea: {
                unit: 'ha',
                unitFullName: 'hectares',
                value: 10.5
              },
              consents: [],
              actions: [
                {
                  code: 'CMOR1',
                  availability: { value: 10.5, unit: 'ha' },
                  description: 'Assess moorland and produce a written record: CMOR1',
                  sssiConsentRequired: false
                }
              ]
            },
            {
              name: 'Livestock grazing on moorland',
              totalAvailableArea: {
                unit: 'ha',
                unitFullName: 'hectares',
                value: 20.75
              },
              consents: ['sssi'],
              actions: [
                {
                  code: 'UPL1',
                  availability: { value: 20.75, unit: 'ha' },
                  description: 'Moderate livestock grazing on moorland: UPL1',
                  sssiConsentRequired: false
                },
                {
                  code: 'UPL2',
                  availability: { value: 15.25, unit: 'ha' },
                  description: 'Moderate livestock grazing on moorland: UPL2',
                  sssiConsentRequired: true
                }
              ]
            }
          ]
        })
      })
    })
  })

  describe('fetchGroupedActionsForParcel caching', () => {
    const mockApiResponse = parcelResponse([apiCMOR1], [{ name: 'Assess moorland', actions: ['CMOR1'] }])

    const parcelArgs = { parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions: ['CMOR1'] }

    beforeEach(() => {
      clearParcelCache()
      configState.reset()
    })

    it('should return cached result on second call with same parcel', async () => {
      parcelsWithGroups.mockResolvedValue(mockApiResponse)

      await fetchGroupedActionsForParcel(parcelArgs)
      const secondResult = await fetchGroupedActionsForParcel(parcelArgs)

      expect(parcelsWithGroups).toHaveBeenCalledTimes(1)
      expect(secondResult.parcel.parcelId).toBe('PARCEL456')
    })

    it('should fetch separately for different parcels', async () => {
      const otherResponse = {
        parcels: [
          {
            parcelId: 'OTHER',
            sheetId: 'OTHER_SHEET',
            size: { value: 10, unit: 'ha' },
            actions: []
          }
        ],
        groups: []
      }
      parcelsWithGroups.mockResolvedValueOnce(mockApiResponse).mockResolvedValueOnce(otherResponse)

      await fetchGroupedActionsForParcel(parcelArgs)
      await fetchGroupedActionsForParcel({ parcelId: 'OTHER', sheetId: 'OTHER_SHEET', enabledLandActions: ['CMOR1'] })

      expect(parcelsWithGroups).toHaveBeenCalledTimes(2)
    })

    it('should fetch separately for the same parcel with different enabledLandActions', async () => {
      parcelsWithGroups.mockResolvedValue(mockApiResponse)

      await fetchGroupedActionsForParcel(parcelArgs)
      await fetchGrouped(['UPL1'])

      expect(parcelsWithGroups).toHaveBeenCalledTimes(2)
    })

    it('should re-fetch after cache TTL expires', async () => {
      vi.useFakeTimers()
      parcelsWithGroups.mockResolvedValue(mockApiResponse)

      await fetchGroupedActionsForParcel(parcelArgs)
      expect(parcelsWithGroups).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(CACHE_TTL_MS + 1)

      await fetchGroupedActionsForParcel(parcelArgs)
      expect(parcelsWithGroups).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('should not cache failed API calls', async () => {
      parcelsWithGroups.mockRejectedValueOnce(new Error('API error'))
      parcelsWithGroups.mockResolvedValueOnce(mockApiResponse)

      await expect(fetchGroupedActionsForParcel(parcelArgs)).rejects.toThrow('API error')

      const result = await fetchGroupedActionsForParcel(parcelArgs)
      expect(parcelsWithGroups).toHaveBeenCalledTimes(2)
      expect(result.parcel.parcelId).toBe('PARCEL456')
    })
  })
})
