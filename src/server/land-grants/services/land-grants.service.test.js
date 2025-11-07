// @ts-nocheck
import { vi } from 'vitest'
import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import {
  calculateGrantPayment,
  fetchAvailableActionsForParcel,
  fetchParcels,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import {
  calculate,
  parcelsWithSize,
  parcelsWithActionsAndSize,
  validate
} from '~/src/server/land-grants/services/land-grants.client.js'
const mockApiEndpoint = 'https://land-grants-api'

vi.mock('~/src/server/land-grants/services/land-grants.client.js', () => ({
  calculate: vi.fn(),
  parcelsWithSize: vi.fn(),
  parcelsWithActionsAndSize: vi.fn(),
  validate: vi.fn()
}))

vi.mock('~/src/config/nunjucks/filters/format-currency.js')
vi.mock('~/src/config/config', async () => {
  const { mockConfig } = await import('~/src/__mocks__')
  return mockConfig({
    'landGrants.grantsServiceApiEndpoint': 'https://land-grants-api'
  })
})
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
          landActions: [
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

    it('should handle null payment total with error message', async () => {
      const mockCalculateResponse = { payment: { total: null } }
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
        ]
      }
      parcelsWithActionsAndSize.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(parcelsWithActionsAndSize).toHaveBeenCalledWith(['SHEET123-PARCEL456'], mockApiEndpoint)

      expect(result).toEqual({
        parcel: {
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123',
          size: { value: 50.5, unit: 'ha' }
        },
        actions: [
          {
            name: 'Assess moorland',
            totalAvailableArea: {
              unit: 'ha',
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
            totalAvailableArea: {
              unit: 'ha',
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

    it('should handle actions not in predefined groups', async () => {
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
        ]
      }

      parcelsWithActionsAndSize.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual({
        parcel: {
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123',
          size: { value: 30.0, unit: 'ha' }
        },
        actions: [
          {
            name: 'Assess moorland',
            totalAvailableArea: {
              unit: 'ha',
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
            name: '',
            totalAvailableArea: {
              unit: 'ha',
              value: 5.0
            },
            actions: [
              { code: 'UNKNOWN1', availableArea: { value: 5.0, unit: 'ha' }, description: 'description: UNKNOWN1' },
              { code: 'UNKNOWN2', availableArea: { value: 3.5, unit: 'ha' }, description: 'description: UNKNOWN2' }
            ]
          }
        ]
      })
    })

    it('should handle only ungrouped actions', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
            size: { value: 20.0, unit: 'ha' },
            actions: [
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
        ]
      }

      parcelsWithActionsAndSize.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual({
        parcel: {
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123',
          size: { value: 20.0, unit: 'ha' }
        },
        actions: [
          {
            name: '',
            totalAvailableArea: {
              unit: 'ha',
              value: 5.0
            },
            actions: [
              { code: 'UNKNOWN1', availableArea: { value: 5.0, unit: 'ha' }, description: 'description: UNKNOWN1' },
              { code: 'UNKNOWN2', availableArea: { value: 3.5, unit: 'ha' }, description: 'description: UNKNOWN2' }
            ]
          }
        ]
      })
    })

    it('should handle empty parcel parameters', async () => {
      const mockApiResponse = { parcels: [] }

      parcelsWithActionsAndSize.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({})

      expect(parcelsWithActionsAndSize).toHaveBeenCalledWith(['-'], mockApiEndpoint)
      expect(result).toEqual({
        parcel: {
          sheetId: '',
          parcelId: '',
          size: { unit: '', value: 0 }
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
        ]
      }

      parcelsWithActionsAndSize.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual({
        parcel: {
          sheetId: 'SHEET123',
          parcelId: 'PARCEL456',
          size: { unit: '', value: 0 }
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
        ]
      }

      parcelsWithActionsAndSize.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual({
        parcel: {
          sheetId: 'SHEET123',
          parcelId: 'PARCEL456',
          size: { value: 10.0, unit: 'ha' }
        },
        actions: []
      })
    })

    it('should handle partial group matches', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
            size: { value: 25.0, unit: 'ha' },
            actions: [
              {
                code: 'UPL1',
                availableArea: { value: 20.75, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland'
              }
              // Only one action from the "Livestock grazing on moorland" group
            ]
          }
        ]
      }

      parcelsWithActionsAndSize.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual({
        parcel: {
          sheetId: 'SHEET123',
          parcelId: 'PARCEL456',
          size: { value: 25.0, unit: 'ha' }
        },
        actions: [
          {
            name: 'Livestock grazing on moorland',
            totalAvailableArea: {
              unit: 'ha',
              value: 20.75
            },
            actions: [
              {
                code: 'UPL1',
                availableArea: { value: 20.75, unit: 'ha' },
                description: 'Moderate livestock grazing on moorland: UPL1'
              }
            ]
          }
        ]
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
        ]
      }

      parcelsWithActionsAndSize.mockResolvedValueOnce(mockApiResponse)

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual({
        parcel: {
          sheetId: 'SHEET123',
          parcelId: 'PARCEL456',
          size: { value: 40.0, unit: 'ha' }
        },
        actions: [
          {
            name: 'Livestock grazing on moorland',
            totalAvailableArea: {
              unit: 'ha',
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
      parcelsWithActionsAndSize.mockRejectedValueOnce(new Error('API error'))

      await expect(
        fetchAvailableActionsForParcel({
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123'
        })
      ).rejects.toThrow('API error')
    })
  })

  describe('fetchParcels', () => {
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

      const result = await fetchParcels('106284736')

      expect(fetchParcelsFromDal).toHaveBeenCalledWith('106284736')
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

      const result = await fetchParcels('106284736')

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

      const result = await fetchParcels('106284736')

      expect(result).toEqual([])
    })

    it('should handle fetchParcelsFromDal error', async () => {
      fetchParcelsFromDal.mockRejectedValueOnce(new Error('SBI service error'))

      await expect(fetchParcels('106284736')).rejects.toThrow('SBI service error')
    })

    it('should handle size API error', async () => {
      const mockParcels = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1' }]
      fetchParcelsFromDal.mockResolvedValueOnce(mockParcels)
      parcelsWithSize.mockRejectedValueOnce(new Error('Size API error'))

      await expect(fetchParcels('106284736')).rejects.toThrow('Size API error')
    })
  })

  describe('validateApplication', () => {
    it('should call the validation application API', async () => {
      const mockApiResponse = { id: '123456' }
      validate.mockResolvedValueOnce(mockApiResponse)

      const result = await validateApplication({
        applicationId: '123456',
        crn: '123456',
        state: {
          landParcels: { 'SHEET1-PARCEL1': { actionsObj: { CMOR1: { value: 10 } } } }
        },
        sbi: '106284736'
      })

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
  })
})
