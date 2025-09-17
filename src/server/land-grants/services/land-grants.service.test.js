import { vi } from 'vitest'
import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsForSbi } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import {
  calculateGrantPayment,
  fetchAvailableActionsForParcel,
  fetchParcels,
  landActionsToApiPayload,
  parseLandParcel,
  postToLandGrantsApi,
  stringifyParcel,
  triggerApiActionsValidation,
  validateApplication
} from './land-grants.service.js'
const mockApiEndpoint = 'https://land-grants-api'

vi.mock('~/src/config/nunjucks/filters/format-currency.js')
vi.mock('~/src/config/config', async () => {
  const { mockConfig } = await import('~/src/__mocks__')
  return mockConfig({
    'landGrants.grantsServiceApiEndpoint': 'https://land-grants-api'
  })
})
vi.mock('~/src/server/common/helpers/logging/logger.js', async () => {
  const { mockLoggerFactoryWithCustomMethods } = await import('~/src/__mocks__')
  return mockLoggerFactoryWithCustomMethods({
    error: vi.fn()
  })
})
vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchParcelsForSbi: vi.fn()
}))

global.fetch = vi.fn()

describe('land-grants service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseLandParcel', () => {
    it('should parse valid land parcel identifier', () => {
      const result = parseLandParcel('ABC123-XYZ789')
      expect(result).toEqual(['ABC123', 'XYZ789'])
    })

    it('should handle land parcel with multiple hyphens', () => {
      const result = parseLandParcel('ABC-123-XYZ-789')
      expect(result).toEqual(['ABC', '123', 'XYZ', '789'])
    })

    it('should handle land parcel without hyphen', () => {
      const result = parseLandParcel('ABC123')
      expect(result).toEqual(['ABC123'])
    })

    it('should handle empty string', () => {
      const result = parseLandParcel('')
      expect(result).toEqual([''])
    })

    it('should handle null/undefined input', () => {
      expect(parseLandParcel(null)).toEqual([''])
      expect(parseLandParcel(undefined)).toEqual([''])
    })

    it('should handle land parcel with trailing hyphen', () => {
      const result = parseLandParcel('ABC123-')
      expect(result).toEqual(['ABC123', ''])
    })

    it('should handle land parcel with leading hyphen', () => {
      const result = parseLandParcel('-XYZ789')
      expect(result).toEqual(['', 'XYZ789'])
    })
  })

  describe('stringifyParcel', () => {
    it('should stringify parcel object correctly', () => {
      const result = stringifyParcel({ parcelId: 'XYZ789', sheetId: 'ABC123' })
      expect(result).toBe('ABC123-XYZ789')
    })

    it('should handle empty strings', () => {
      const result = stringifyParcel({ parcelId: '', sheetId: '' })
      expect(result).toBe('-')
    })

    it('should handle special characters', () => {
      const result = stringifyParcel({
        parcelId: 'parcelId',
        sheetId: 'sheetId'
      })
      expect(result).toBe('sheetId-parcelId')
    })

    it('should handle numeric values', () => {
      const result = stringifyParcel({ parcelId: 789, sheetId: 123 })
      expect(result).toBe('123-789')
    })
  })

  describe('postToLandGrantsApi', () => {
    it('should make successful POST request', async () => {
      const mockResponse = { id: 1, status: 'success' }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      const result = await postToLandGrantsApi('/submit', { data: 'test' })

      expect(fetch).toHaveBeenCalledWith(`${mockApiEndpoint}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: 'test' })
      })
      expect(result).toEqual(mockResponse)
    })

    it('should handle 404 error', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      await expect(postToLandGrantsApi('/invalid', {})).rejects.toThrow('Not Found')

      let code, message
      try {
        await postToLandGrantsApi('/invalid', {})
      } catch (error) {
        code = error.code
        message = error.message
      }
      expect(code).toBe(404)
      expect(message).toBe('Not Found')
    })

    it('should handle 500 error', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      await expect(postToLandGrantsApi('/error', {})).rejects.toThrow('Internal Server Error')

      let code, message
      try {
        await postToLandGrantsApi('/error', {})
      } catch (error) {
        code = error.code
        message = error.message
      }

      expect(code).toBe(500)
      expect(message).toBe('Internal Server Error')
    })

    it('should handle network error', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(postToLandGrantsApi('/test', {})).rejects.toThrow('Network error')
    })

    it('should handle empty endpoint', async () => {
      const mockResponse = { success: true }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockResponse
      })

      await postToLandGrantsApi('', { test: 'data' })

      expect(fetch).toHaveBeenCalledWith(mockApiEndpoint, expect.any(Object))
    })
  })

  describe('landActionsToApiPayload', () => {
    it('should convert land actions to API payload format', () => {
      const input = {
        sheetId: 'sheetId',
        parcelId: 'parcelId',
        actionsObj: {
          CMOR1: { value: 10.5, unit: 'ha' },
          UPL1: { value: 20.75, unit: 'ha' }
        }
      }

      const result = landActionsToApiPayload(input)

      expect(result).toEqual({
        sheetId: 'sheetId',
        parcelId: 'parcelId',
        sbi: 106284736,
        actions: [
          { code: 'CMOR1', quantity: 10.5 },
          { code: 'UPL1', quantity: 20.75 }
        ]
      })
    })

    it('should handle empty actions object', () => {
      const input = {
        sheetId: 'sheetId',
        parcelId: 'parcelId',
        actionsObj: {}
      }

      const result = landActionsToApiPayload(input)

      expect(result).toEqual({
        sheetId: 'sheetId',
        parcelId: 'parcelId',
        sbi: 106284736,
        actions: []
      })
    })
  })

  describe('calculateGrantPayment', () => {
    it('should calculate payment and format amount', async () => {
      const mockApiResponse = {
        payment: { annualTotalPence: 123456 },
        breakdown: { CMOR1: 1000, action2: 23456 }
      }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })
      formatCurrency.mockReturnValue('£1,234.56')

      const result = await calculateGrantPayment({
        sheetId: 'SHEET123',
        parcelId: 'PARCEL456',
        sbi: 106284736,
        actions: [{ code: 'CMOR1', quantity: 10 }]
      })

      expect(fetch).toHaveBeenCalledWith(
        `${mockApiEndpoint}/payments/calculate`,
        expect.objectContaining({
          body: JSON.stringify({
            sheetId: 'SHEET123',
            parcelId: 'PARCEL456',
            sbi: 106284736,
            actions: [{ code: 'CMOR1', quantity: 10 }]
          })
        })
      )
      expect(formatCurrency).toHaveBeenCalledWith(1234.56)
      expect(result).toEqual({
        payment: { annualTotalPence: 123456 },
        breakdown: { CMOR1: 1000, action2: 23456 },
        paymentTotal: '£1,234.56',
        errorMessage: undefined
      })
    })

    it('should handle zero payment amount', async () => {
      const mockApiResponse = { payment: { total: 0 } }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })
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
      const mockApiResponse = {
        /* no payment property */
      }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })
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
      const mockApiResponse = { payment: { total: null } }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })
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
      fetch.mockRejectedValueOnce(new Error('API error'))

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
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(fetch).toHaveBeenCalledWith(
        `${mockApiEndpoint}/parcels`,
        expect.objectContaining({
          body: JSON.stringify({
            parcelIds: ['SHEET123-PARCEL456'],
            fields: ['actions', 'size']
          })
        })
      )

      expect(result).toEqual([
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
      ])
    })

    it('should handle actions not in predefined groups', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
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
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual([
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
      ])
    })

    it('should handle only ungrouped actions', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
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
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual([
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
      ])
    })

    it('should handle empty parcel parameters', async () => {
      const mockApiResponse = { parcels: [] }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await fetchAvailableActionsForParcel({})

      expect(fetch).toHaveBeenCalledWith(
        `${mockApiEndpoint}/parcels`,
        expect.objectContaining({
          body: JSON.stringify({
            parcelIds: ['-'],
            fields: ['actions', 'size']
          })
        })
      )
      expect(result).toEqual([])
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
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual([])
    })

    it('should return empty array when parcel has no actions', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
            actions: []
          }
        ]
      }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual([])
    })

    it('should handle partial group matches', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
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
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual([
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
      ])
    })

    it('should use maximum value when multiple actions have different areas', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
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
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await fetchAvailableActionsForParcel({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123'
      })

      expect(result).toEqual([
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
      ])
    })

    it('should handle API errors', async () => {
      fetch.mockRejectedValueOnce(new Error('API error'))

      await expect(
        fetchAvailableActionsForParcel({
          parcelId: 'PARCEL456',
          sheetId: 'SHEET123'
        })
      ).rejects.toThrow('API error')
    })
  })

  describe('validateLandActions', () => {
    it('should validate land actions successfully', async () => {
      const mockApiResponse = {
        valid: true,
        errors: [],
        warnings: []
      }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await triggerApiActionsValidation({
        sheetId: 'SHEET123',
        parcelId: 'PARCEL456',
        actionsObj: {
          CMOR1: { value: 10.5 },
          UPL1: { value: 20.75 }
        }
      })

      expect(fetch).toHaveBeenCalledWith(
        `${mockApiEndpoint}/actions/validate`,
        expect.objectContaining({
          body: JSON.stringify({
            landActions: [
              {
                sheetId: 'SHEET123',
                parcelId: 'PARCEL456',
                sbi: 106284736,
                actions: [
                  { code: 'CMOR1', quantity: 10.5 },
                  { code: 'UPL1', quantity: 20.75 }
                ]
              }
            ]
          })
        })
      )
      expect(result).toEqual(mockApiResponse)
    })

    it('should handle validation with errors', async () => {
      const mockApiResponse = {
        valid: false,
        errors: ['Area exceeds maximum allowed'],
        warnings: ['Consider alternative action']
      }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await triggerApiActionsValidation({
        sheetId: 'SHEET123',
        parcelId: 'PARCEL456',
        actionsObj: { CMOR1: { value: 100 } }
      })

      expect(result).toEqual(mockApiResponse)
    })

    it('should handle empty actions object', async () => {
      const mockApiResponse = { valid: true, errors: [], warnings: [] }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await triggerApiActionsValidation({
        sheetId: 'SHEET123',
        parcelId: 'PARCEL456'
      })

      expect(fetch).toHaveBeenCalledWith(
        `${mockApiEndpoint}/actions/validate`,
        expect.objectContaining({
          body: JSON.stringify({
            landActions: [
              {
                sheetId: 'SHEET123',
                parcelId: 'PARCEL456',
                sbi: 106284736,
                actions: []
              }
            ]
          })
        })
      )
      expect(result).toEqual(mockApiResponse)
    })

    it('should handle API errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Validation API error'))

      await expect(
        triggerApiActionsValidation({
          sheetId: 'SHEET123',
          parcelId: 'PARCEL456',
          actionsObj: { CMOR1: { value: 10 } }
        })
      ).rejects.toThrow('Validation API error')
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

      fetchParcelsForSbi.mockResolvedValueOnce(mockParcels)
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockSizeResponse
      })

      const result = await fetchParcels('106284736')

      expect(fetchParcelsForSbi).toHaveBeenCalledWith('106284736')
      expect(fetch).toHaveBeenCalledWith(
        `${mockApiEndpoint}/parcels`,
        expect.objectContaining({
          body: JSON.stringify({
            parcelIds: ['SHEET1-PARCEL1', 'SHEET2-PARCEL2'],
            fields: ['size']
          })
        })
      )
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

      fetchParcelsForSbi.mockResolvedValueOnce(mockParcels)
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockSizeResponse
      })

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

      fetchParcelsForSbi.mockResolvedValueOnce(mockParcels)
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockSizeResponse
      })

      const result = await fetchParcels('106284736')

      expect(result).toEqual([])
    })

    it('should handle fetchParcelsForSbi error', async () => {
      fetchParcelsForSbi.mockRejectedValueOnce(new Error('SBI service error'))

      await expect(fetchParcels('106284736')).rejects.toThrow('SBI service error')
    })

    it('should handle size API error', async () => {
      const mockParcels = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1' }]
      fetchParcelsForSbi.mockResolvedValueOnce(mockParcels)
      fetch.mockRejectedValueOnce(new Error('Size API error'))

      await expect(fetchParcels('106284736')).rejects.toThrow('Size API error')
    })
  })

  describe('validationApplication', () => {
    it('should call the validation application API', async () => {
      const mockApiResponse = { id: '123456' }
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => mockApiResponse
      })

      const result = await validateApplication({
        applicationId: '123456',
        crn: '123456',
        landParcels: { 'SHEET1-PARCEL1': { actionsObj: { CMOR1: { value: 10 } } } },
        sbi: '106284736'
      })

      expect(fetch).toHaveBeenCalledWith(
        `${mockApiEndpoint}/application/validate`,
        expect.objectContaining({
          body: JSON.stringify({
            applicationId: '123456',
            requester: 'grants-ui',
            applicantCrn: '123456',
            landActions: [
              { sheetId: 'SHEET1', parcelId: 'PARCEL1', sbi: '106284736', actions: [{ code: 'CMOR1', quantity: 10 }] }
            ]
          })
        })
      )
      expect(result).toEqual(mockApiResponse)
    })
  })
})
