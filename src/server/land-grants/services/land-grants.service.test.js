// @ts-nocheck
import { vi } from 'vitest'
import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import {
  calculateGrantPayment,
  fetchAvailableActionsForParcel,
  fetchParcels,
  fetchParcelsGroups,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import {
  calculate,
  parcelsGroups,
  parcelsWithSize,
  parcelsWithExtendedInfo,
  validate
} from '~/src/server/land-grants/services/land-grants.client.js'
import { clearParcelCache } from '~/src/server/land-grants/services/parcel-cache.js'
const mockApiEndpoint = 'https://land-grants-api'

vi.mock('~/src/server/land-grants/services/land-grants.client.js', () => ({
  calculate: vi.fn(),
  parcelsGroups: vi.fn(),
  parcelsWithSize: vi.fn(),
  parcelsWithExtendedInfo: vi.fn(),
  validate: vi.fn()
}))

vi.mock('~/src/config/nunjucks/filters/format-currency.js')

// Hoisted shared state + helpers that the mock will use
const configState = vi.hoisted(() => {
  const values = new Map([
    ['landGrants.grantsServiceApiEndpoint', 'https://land-grants-api'] // set once
  ])

  return {
    set(key, value) {
      values.set(key, value)
    },
    reset() {
      values.clear()
      values.set('landGrants.grantsServiceApiEndpoint', 'https://land-grants-api')
    },
    get(key) {
      return values.get(key)
    }
  }
})

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn((key) => configState.get(key))
  }
}))

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchParcelsFromDal: vi.fn()
}))

describe('land-grants service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calculateGrantPayment', () => {
    it('should calculate payment and format amount', async () => {
      const mockCalculateResponse = {
        payment: { annualTotalPence: 123456 }
      }
      calculate.mockResolvedValueOnce(mockCalculateResponse)
      formatCurrency.mockReturnValue('£1,234.56')

      const result = await calculateGrantPayment({
        landParcels: {
          'SD1234-5678': {
            actionsObj: {
              CMOR1: {
                value: 10
              }
            }
          }
        }
      })

      expect(calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          parcel: [
            {
              sheetId: 'SD1234',
              parcelId: '5678',
              actions: [{ code: 'CMOR1', quantity: 10 }]
            }
          ]
        }),
        mockApiEndpoint
      )
      expect(formatCurrency).toHaveBeenCalledWith(1234.56)
      expect(result).toEqual({
        payment: { annualTotalPence: 123456 },
        paymentTotal: '£1,234.56',
        errorMessage: undefined
      })
    })

    it('should handle zero payment amount', async () => {
      const mockCalculateResponse = { payment: { total: 0 } }
      calculate.mockResolvedValueOnce(mockCalculateResponse)
      formatCurrency.mockReturnValue('£0.00')

      const result = await calculateGrantPayment({
        landParcels: {
          'SHEET123-PARCEL456': {
            actionsObj: { CMOR1: { value: 0 } }
          }
        }
      })

      expect(result.paymentTotal).toBe('£0.00')
      expect(result.errorMessage).toBeUndefined()
    })

    it('should handle missing payment data with error message', async () => {
      const mockCalculateResponse = {
        /* no payment property */
      }
      calculate.mockResolvedValueOnce(mockCalculateResponse)

      formatCurrency.mockReturnValue(null)

      const result = await calculateGrantPayment({
        landParcels: {
          'SHEET123-PARCEL456': {}
        }
      })

      expect(result.paymentTotal).toBeNull()
      expect(result.errorMessage).toBe('Error calculating payment. Please try again later.')
    })

    it('should propagate API errors', async () => {
      calculate.mockRejectedValueOnce(new Error('API error'))

      await expect(
        calculateGrantPayment({
          landParcels: {
            'SHEET123-PARCEL456': {}
          }
        })
      ).rejects.toThrow('API error')
    })
  })

  describe('fetchAvailableActionsForParcel', () => {
    beforeEach(() => {
      clearParcelCache()
      configState.reset()
      configState.set('landGrants.enableSSSIFeature', false)
    })

    it('should fetch and group available actions for a parcel successfully', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
            size: { value: 50.5, unit: 'ha' },
            actions: [
              {
                code: 'CMOR1',
                availableArea: { value: 10.5, unit: 'ha' },
                description: 'Assess moorland and produce a written record'
              },
              {
                code: 'UPL1',
                availableArea: { value: 20.75, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland'
              },
              {
                code: 'UPL2',
                availableArea: { value: 15.25, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland'
              }
            ]
          }
        ],
        groups: [
          { name: 'Assess moorland', actions: ['CMOR1'] },
          { name: 'Livestock grazing on moorland', actions: ['UPL1', 'UPL2', 'UPL3'] }
        ]
      }
      parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(parcelsWithExtendedInfo).toHaveBeenCalledWith(['SHEET123-PARCEL456'], mockApiEndpoint)

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
            actions: [
              {
                code: 'CMOR1',
                availableArea: { value: 10.5, unit: 'ha' },
                description: 'Assess moorland and produce a written record: CMOR1'
              }
            ]
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
                availableArea: { value: 20.75, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL1'
              },
              {
                code: 'UPL2',
                availableArea: { value: 15.25, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL2'
              }
            ]
          }
        ]
      })
    })

    it('should exclude actions not in any backend group', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
            size: { value: 30.0, unit: 'ha' },
            actions: [
              {
                code: 'CMOR1',
                availableArea: { value: 10.5, unit: 'ha' },
                description: 'Assess moorland and produce a written record'
              },
              {
                code: 'UNKNOWN1',
                availableArea: { value: 5.0, unit: 'ha' },
                description: 'description'
              },
              {
                code: 'UNKNOWN2',
                availableArea: { value: 3.5, unit: 'ha' },
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

      parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

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
            actions: [
              {
                code: 'CMOR1',
                availableArea: { value: 10.5, unit: 'ha' },
                description: 'Assess moorland and produce a written record: CMOR1'
              }
            ]
          }
        ]
      })
    })

    it('should handle empty parcel parameters', async () => {
      const mockApiResponse = { parcels: [], groups: [] }

      parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({})

      expect(parcelsWithExtendedInfo).toHaveBeenCalledWith(['-'], mockApiEndpoint)
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

      parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

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

      parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

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
                availableArea: { value: 15.0, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland'
              },
              {
                code: 'UPL2',
                availableArea: { value: 25.5, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland'
              },
              {
                code: 'UPL3',
                availableArea: { value: 10.0, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland'
              }
            ]
          }
        ],
        groups: [{ name: 'Livestock grazing on moorland', actions: ['UPL1', 'UPL2', 'UPL3'] }]
      }

      parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

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
                availableArea: { value: 15.0, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL1'
              },
              {
                code: 'UPL2',
                availableArea: { value: 25.5, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL2'
              },
              {
                code: 'UPL3',
                availableArea: { value: 10.0, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL3'
              }
            ]
          }
        ]
      })
    })

    it('should handle API errors', async () => {
      parcelsWithExtendedInfo.mockRejectedValueOnce(new Error('API error'))

      await expect(
        fetchAvailableActionsForParcel({
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123'
        })
      ).rejects.toThrow('API error')
    })

    describe('when enableUpl8And10 flag is off', () => {
      beforeEach(() => {
        configState.reset()
        configState.set('landGrants.enableUpl8And10', false)
      })

      it('should treat UPL8 and UPL10 actions as ungrouped when flag is off', async () => {
        const mockApiResponse = {
          parcels: [
            {
              parcelId: 'PARCEL456',
              sheetId: 'SHEET123',
              size: { value: 50.5, unit: 'ha' },
              actions: [
                {
                  code: 'CMOR1',
                  availableArea: { value: 10.5, unit: 'ha' },
                  description: 'Assess moorland and produce a written record'
                },
                {
                  code: 'UPL8',
                  availableArea: { value: 12.0, unit: 'ha' },
                  description: 'Shepherding livestock on moorland'
                },
                {
                  code: 'UPL10',
                  availableArea: { value: 8.0, unit: 'ha' },
                  description: 'Shepherding livestock on moorland'
                }
              ]
            }
          ],
          groups: [
            { name: 'Assess moorland', actions: ['CMOR1'] },
            { name: 'Shepherding livestock on moorland', actions: ['UPL8', 'UPL10'] }
          ]
        }
        parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse)

        const result = await fetchAvailableActionsForParcel({
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123'
        })

        expect(result.actions).toEqual([
          {
            name: 'Assess moorland',
            consents: [],
            totalAvailableArea: { unit: 'ha', unitFullName: 'hectares', value: 10.5 },
            actions: [
              {
                code: 'CMOR1',
                availableArea: { value: 10.5, unit: 'ha' },
                description: 'Assess moorland and produce a written record: CMOR1'
              }
            ]
          }
        ])
      })
    })

    describe('when enableUpl8And10 flag is on', () => {
      beforeEach(() => {
        configState.reset()
        configState.set('landGrants.enableUpl8And10', true)
      })

      it('should group UPL8 and UPL10 actions under Shepherding livestock on moorland', async () => {
        const mockApiResponse = {
          parcels: [
            {
              parcelId: 'PARCEL456',
              sheetId: 'SHEET123',
              size: { value: 50.5, unit: 'ha' },
              actions: [
                {
                  code: 'CMOR1',
                  availableArea: { value: 10.5, unit: 'ha' },
                  description: 'Assess moorland and produce a written record'
                },
                {
                  code: 'UPL8',
                  availableArea: { value: 12.0, unit: 'ha' },
                  description: 'Shepherding livestock on moorland'
                },
                {
                  code: 'UPL10',
                  availableArea: { value: 8.0, unit: 'ha' },
                  description: 'Shepherding livestock on moorland'
                }
              ]
            }
          ],
          groups: [
            { name: 'Assess moorland', actions: ['CMOR1'] },
            { name: 'Shepherding livestock on moorland', actions: ['UPL8', 'UPL10'] }
          ]
        }
        parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse)

        const result = await fetchAvailableActionsForParcel({
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123'
        })

        expect(result.actions).toEqual([
          {
            name: 'Assess moorland',
            consents: [],
            totalAvailableArea: { unit: 'ha', unitFullName: 'hectares', value: 10.5 },
            actions: [
              {
                code: 'CMOR1',
                availableArea: { value: 10.5, unit: 'ha' },
                description: 'Assess moorland and produce a written record: CMOR1'
              }
            ]
          },
          {
            name: 'Shepherding livestock on moorland',
            consents: [],
            totalAvailableArea: { unit: 'ha', unitFullName: 'hectares', value: 12.0 },
            actions: [
              {
                code: 'UPL8',
                availableArea: { value: 12.0, unit: 'ha' },
                description: 'Shepherding livestock on moorland: UPL8'
              },
              {
                code: 'UPL10',
                availableArea: { value: 8.0, unit: 'ha' },
                description: 'Shepherding livestock on moorland: UPL10'
              }
            ]
          }
        ])
      })
    })

    describe('V2 - SSSI Consent required flag is enabled', () => {
      beforeEach(() => {
        configState.reset()
        configState.set('landGrants.enableSSSIFeature', true)
      })

      it('should fetch and group available actions for a parcel successfully', async () => {
        const mockApiResponse = {
          parcels: [
            {
              parcelId: 'PARCEL456',
              sheetId: 'SHEET123',
              size: { value: 50.5, unit: 'ha' },
              actions: [
                {
                  code: 'CMOR1',
                  availableArea: { value: 10.5, unit: 'ha' },
                  description: 'Assess moorland and produce a written record',
                  sssiConsentRequired: false
                },
                {
                  code: 'UPL1',
                  availableArea: { value: 20.75, unit: 'ha' },
                  description: 'Moderate livestock grazing on moorland',
                  sssiConsentRequired: false
                },
                {
                  code: 'UPL2',
                  availableArea: { value: 15.25, unit: 'ha' },
                  description: 'Moderate livestock grazing on moorland',
                  sssiConsentRequired: true
                }
              ]
            }
          ],
          groups: [
            { name: 'Assess moorland', actions: ['CMOR1'] },
            { name: 'Livestock grazing on moorland', actions: ['UPL1', 'UPL2', 'UPL3'] }
          ]
        }
        parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse)

        const result = await fetchAvailableActionsForParcel({
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123'
        })

        expect(parcelsWithExtendedInfo).toHaveBeenCalledWith(['SHEET123-PARCEL456'], mockApiEndpoint)

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
                  availableArea: { value: 10.5, unit: 'ha' },
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
                  availableArea: { value: 20.75, unit: 'ha' },
                  description: 'Moderate livestock grazing on moorland: UPL1',
                  sssiConsentRequired: false
                },
                {
                  code: 'UPL2',
                  availableArea: { value: 15.25, unit: 'ha' },
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

  describe('fetchAvailableActionsForParcel caching', () => {
    const mockApiResponse = {
      parcels: [
        {
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123',
          size: { value: 50.5, unit: 'ha' },
          actions: [
            {
              code: 'CMOR1',
              availableArea: { value: 10.5, unit: 'ha' },
              description: 'Assess moorland and produce a written record'
            }
          ]
        }
      ],
      groups: [{ name: 'Assess moorland', actions: ['CMOR1'] }]
    }

    const parcelArgs = { parcelId: 'PARCEL456', sheetId: 'SHEET123' }

    beforeEach(() => {
      clearParcelCache()
      configState.reset()
    })

    it('should return cached result on second call with same parcel', async () => {
      parcelsWithExtendedInfo.mockResolvedValue(mockApiResponse)

      await fetchAvailableActionsForParcel(parcelArgs)
      const secondResult = await fetchAvailableActionsForParcel(parcelArgs)

      expect(parcelsWithExtendedInfo).toHaveBeenCalledTimes(1)
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
      parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse).mockResolvedValueOnce(otherResponse)

      await fetchAvailableActionsForParcel(parcelArgs)
      await fetchAvailableActionsForParcel({ parcelId: 'OTHER', sheetId: 'OTHER_SHEET' })

      expect(parcelsWithExtendedInfo).toHaveBeenCalledTimes(2)
    })

    it('should re-fetch after cache TTL expires', async () => {
      vi.useFakeTimers()
      parcelsWithExtendedInfo.mockResolvedValue(mockApiResponse)

      await fetchAvailableActionsForParcel(parcelArgs)
      expect(parcelsWithExtendedInfo).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(5 * 60 * 1000 + 1) // just past TTL

      await fetchAvailableActionsForParcel(parcelArgs)
      expect(parcelsWithExtendedInfo).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('should not cache failed API calls', async () => {
      parcelsWithExtendedInfo.mockRejectedValueOnce(new Error('API error'))
      parcelsWithExtendedInfo.mockResolvedValueOnce(mockApiResponse)

      await expect(fetchAvailableActionsForParcel(parcelArgs)).rejects.toThrow('API error')

      const result = await fetchAvailableActionsForParcel(parcelArgs)
      expect(parcelsWithExtendedInfo).toHaveBeenCalledTimes(2)
      expect(result.parcel.parcelId).toBe('PARCEL456')
    })
  })

  describe('fetchParcels', () => {
    const mockRequest = { auth: { credentials: { sbi: '106284736' } } }

    beforeEach(() => {
      clearParcelCache()
    })

    it('should fetch parcels with size data successfully', async () => {
      const mockParcels = [
        { parcelId: 'PARCEL1', sheetId: 'SHEET1' },
        { parcelId: 'PARCEL2', sheetId: 'SHEET2' }
      ]
      const mockSizeResponse = {
        parcels: [
          {
            parcelId: 'PARCEL1',
            sheetId: 'SHEET1',
            size: { total: 15.5, unit: 'ha' }
          },
          {
            parcelId: 'PARCEL2',
            sheetId: 'SHEET2',
            size: { total: 22.3, unit: 'ha' }
          }
        ]
      }

      fetchParcelsFromDal.mockResolvedValueOnce(mockParcels)
      parcelsWithSize.mockResolvedValueOnce(mockSizeResponse)

      const result = await fetchParcels(mockRequest)

      expect(fetchParcelsFromDal).toHaveBeenCalledWith(mockRequest)
      expect(parcelsWithSize).toHaveBeenCalledWith(['SHEET1-PARCEL1', 'SHEET2-PARCEL2'], mockApiEndpoint)
      expect(result).toEqual([
        {
          parcelId: 'PARCEL1',
          sheetId: 'SHEET1',
          area: { total: 15.5, unit: 'ha' }
        },
        {
          parcelId: 'PARCEL2',
          sheetId: 'SHEET2',
          area: { total: 22.3, unit: 'ha' }
        }
      ])
    })

    it('should handle parcels with missing size data', async () => {
      const mockParcels = [
        { parcelId: 'PARCEL1', sheetId: 'SHEET1' },
        { parcelId: 'PARCEL2', sheetId: 'SHEET2' }
      ]
      const mockSizeResponse = {
        parcels: [
          {
            parcelId: 'PARCEL1',
            sheetId: 'SHEET1',
            size: { total: 15.5, unit: 'ha' }
          }
          // PARCEL2 size data missing
        ]
      }

      fetchParcelsFromDal.mockResolvedValueOnce(mockParcels)
      parcelsWithSize.mockResolvedValueOnce(mockSizeResponse)

      const result = await fetchParcels(mockRequest)

      expect(result).toEqual([
        {
          parcelId: 'PARCEL1',
          sheetId: 'SHEET1',
          area: { total: 15.5, unit: 'ha' }
        },
        {
          parcelId: 'PARCEL2',
          sheetId: 'SHEET2',
          area: {}
        }
      ])
    })

    it('should handle empty parcels list', async () => {
      const mockParcels = []
      const mockSizeResponse = { parcels: [] }

      fetchParcelsFromDal.mockResolvedValueOnce(mockParcels)
      parcelsWithSize.mockResolvedValueOnce(mockSizeResponse)

      const result = await fetchParcels(mockRequest)

      expect(result).toEqual([])
    })

    it('should handle fetchParcelsFromDal error', async () => {
      fetchParcelsFromDal.mockRejectedValueOnce(new Error('SBI service error'))

      await expect(fetchParcels(mockRequest)).rejects.toThrow('SBI service error')
    })

    it('should handle size API error', async () => {
      const mockParcels = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1' }]
      fetchParcelsFromDal.mockResolvedValueOnce(mockParcels)
      parcelsWithSize.mockRejectedValueOnce(new Error('Size API error'))

      await expect(fetchParcels(mockRequest)).rejects.toThrow('Size API error')
    })

    it('should return cached result on second call with same SBI', async () => {
      const mockParcels = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1' }]
      const mockSizeResponse = {
        parcels: [{ parcelId: 'PARCEL1', sheetId: 'SHEET1', size: { total: 15.5, unit: 'ha' } }]
      }
      fetchParcelsFromDal.mockResolvedValue(mockParcels)
      parcelsWithSize.mockResolvedValue(mockSizeResponse)

      await fetchParcels(mockRequest)
      const secondResult = await fetchParcels(mockRequest)

      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(1)
      expect(secondResult).toEqual([{ parcelId: 'PARCEL1', sheetId: 'SHEET1', area: { total: 15.5, unit: 'ha' } }])
    })

    it('should fetch separately for different SBIs', async () => {
      const mockParcels = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1' }]
      const mockSizeResponse = {
        parcels: [{ parcelId: 'PARCEL1', sheetId: 'SHEET1', size: { total: 15.5, unit: 'ha' } }]
      }
      fetchParcelsFromDal.mockResolvedValue(mockParcels)
      parcelsWithSize.mockResolvedValue(mockSizeResponse)

      const otherRequest = { auth: { credentials: { sbi: '999999999' } } }

      await fetchParcels(mockRequest)
      await fetchParcels(otherRequest)

      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)
    })

    it('should re-fetch after cache TTL expires', async () => {
      vi.useFakeTimers()
      const mockParcels = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1' }]
      const mockSizeResponse = {
        parcels: [{ parcelId: 'PARCEL1', sheetId: 'SHEET1', size: { total: 15.5, unit: 'ha' } }]
      }
      fetchParcelsFromDal.mockResolvedValue(mockParcels)
      parcelsWithSize.mockResolvedValue(mockSizeResponse)

      await fetchParcels(mockRequest)
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(5 * 60 * 1000 + 1)

      await fetchParcels(mockRequest)
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('should not cache failed API calls', async () => {
      const mockParcels = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1' }]
      const mockSizeResponse = {
        parcels: [{ parcelId: 'PARCEL1', sheetId: 'SHEET1', size: { total: 15.5, unit: 'ha' } }]
      }
      fetchParcelsFromDal.mockRejectedValueOnce(new Error('API error'))
      fetchParcelsFromDal.mockResolvedValueOnce(mockParcels)
      parcelsWithSize.mockResolvedValueOnce(mockSizeResponse)

      await expect(fetchParcels(mockRequest)).rejects.toThrow('API error')

      const result = await fetchParcels(mockRequest)
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)
      expect(result).toEqual([{ parcelId: 'PARCEL1', sheetId: 'SHEET1', area: { total: 15.5, unit: 'ha' } }])
    })
  })

  describe('fetchParcelsGroups', () => {
    it('should fetch groups for parcels in state', async () => {
      const mockGroups = [
        { name: 'Assess moorland', actions: ['CMOR1'] },
        { name: 'Livestock grazing on moorland', actions: ['UPL1', 'UPL2', 'UPL3'] }
      ]
      parcelsGroups.mockResolvedValueOnce({ groups: mockGroups })

      const state = {
        landParcels: {
          'SHEET1-PARCEL1': { actionsObj: {} },
          'SHEET2-PARCEL2': { actionsObj: {} }
        }
      }

      const result = await fetchParcelsGroups(state)

      expect(parcelsGroups).toHaveBeenCalledWith(['SHEET1-PARCEL1', 'SHEET2-PARCEL2'], mockApiEndpoint)
      expect(result).toEqual(mockGroups)
    })

    it('should return empty array when no land parcels', async () => {
      const state = { landParcels: {} }

      const result = await fetchParcelsGroups(state)

      expect(parcelsGroups).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('should handle missing groups in response', async () => {
      parcelsGroups.mockResolvedValueOnce({})

      const state = { landParcels: { 'SHEET1-PARCEL1': {} } }

      const result = await fetchParcelsGroups(state)

      expect(result).toEqual([])
    })
  })

  describe('validateApplication', () => {
    const validationInput = {
      applicationId: '123456',
      crn: '123456',
      state: {
        landParcels: { 'SHEET1-PARCEL1': { actionsObj: { CMOR1: { value: 10 } } } }
      },
      sbi: '106284736'
    }

    it('should call the validation application API', async () => {
      const mockApiResponse = { id: '123456' }
      validate.mockResolvedValueOnce(mockApiResponse)

      const result = await validateApplication(validationInput)

      expect(validate).toHaveBeenCalledWith(
        {
          applicationId: '123456',
          requester: 'grants-ui',
          applicantCrn: '123456',
          sbi: '106284736',
          landActions: [{ sheetId: 'SHEET1', parcelId: 'PARCEL1', actions: [{ code: 'CMOR1', quantity: 10 }] }]
        },
        mockApiEndpoint
      )
      expect(result).toEqual(mockApiResponse)
    })

    describe('building errorMessages from response', () => {
      it('should build errorMessages from actions with failed rules', async () => {
        validate.mockResolvedValueOnce({
          valid: false,
          actions: [
            {
              actionCode: 'CMOR1',
              sheetId: 'SD6843',
              parcelId: '7039',
              hasPassed: false,
              rules: [
                {
                  name: 'parcel-has-intersection-with-data-layer-moorland',
                  passed: false,
                  reason: 'This parcel is not majority on the moorland',
                  description: 'Is this parcel on the moorland?'
                },
                {
                  name: 'applied-for-total-available-area',
                  passed: false,
                  reason: 'There is not sufficient available area (1.3308 ha) for the applied figure (12.4034 ha)',
                  description: 'Has the total available area been applied for?'
                }
              ]
            }
          ]
        })

        const result = await validateApplication(validationInput)

        expect(result.errorMessages).toEqual([
          {
            code: 'CMOR1',
            description: 'This parcel is not majority on the moorland',
            sheetId: 'SD6843',
            parcelId: '7039',
            passed: false
          },
          {
            code: 'CMOR1',
            description: 'There is not sufficient available area (1.3308 ha) for the applied figure (12.4034 ha)',
            sheetId: 'SD6843',
            parcelId: '7039',
            passed: false
          }
        ])
      })

      it('should skip actions that have passed', async () => {
        validate.mockResolvedValueOnce({
          valid: false,
          actions: [
            {
              actionCode: 'CMOR1',
              sheetId: 'SD7861',
              parcelId: '5677',
              hasPassed: true,
              rules: [{ name: 'rule1', passed: true, reason: 'Passed', description: 'Check' }]
            },
            {
              actionCode: 'UPL1',
              sheetId: 'SD6843',
              parcelId: '7039',
              hasPassed: false,
              rules: [{ name: 'rule2', passed: false, reason: 'Not sufficient area', description: 'Area check' }]
            }
          ]
        })

        const result = await validateApplication(validationInput)

        expect(result.errorMessages).toEqual([
          {
            code: 'UPL1',
            description: 'Not sufficient area',
            sheetId: 'SD6843',
            parcelId: '7039',
            passed: false
          }
        ])
      })

      it('should skip passed rules within a failed action', async () => {
        validate.mockResolvedValueOnce({
          valid: false,
          actions: [
            {
              actionCode: 'CMOR1',
              sheetId: 'SD6843',
              parcelId: '7039',
              hasPassed: false,
              rules: [
                { name: 'rule1', passed: true, reason: 'Passed check', description: 'Check 1' },
                { name: 'rule2', passed: false, reason: 'Failed check', description: 'Check 2' }
              ]
            }
          ]
        })

        const result = await validateApplication(validationInput)

        expect(result.errorMessages).toEqual([
          {
            code: 'CMOR1',
            description: 'Failed check',
            sheetId: 'SD6843',
            parcelId: '7039',
            passed: false
          }
        ])
      })

      it('should return empty errorMessages when all actions pass', async () => {
        validate.mockResolvedValueOnce({
          valid: true,
          actions: [
            {
              actionCode: 'CMOR1',
              sheetId: 'SD7861',
              parcelId: '5677',
              hasPassed: true,
              rules: [{ name: 'rule1', passed: true, reason: 'Passed', description: 'Check' }]
            }
          ]
        })

        const result = await validateApplication(validationInput)

        expect(result.errorMessages).toEqual([])
      })

      it('should handle response with empty actions array', async () => {
        validate.mockResolvedValueOnce({
          valid: false,
          actions: []
        })

        const result = await validateApplication(validationInput)

        expect(result.errorMessages).toEqual([])
      })
    })

    it('should return empty errorMessages when response has no actions', async () => {
      const mockApiResponse = {
        valid: false
      }
      validate.mockResolvedValueOnce(mockApiResponse)

      const result = await validateApplication(validationInput)

      expect(result.errorMessages).toEqual([])
    })
  })
})
