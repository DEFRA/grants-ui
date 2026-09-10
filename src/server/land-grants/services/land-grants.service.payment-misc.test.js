// @ts-nocheck
import { vi } from 'vitest'
import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import {
  calculateLandActionsPayment as calculateLandActionsPaymentService,
  fetchActionsWithPlannedActions as fetchActionsWithPlannedActionsService,
  fetchParcelsGroups as fetchParcelsGroupsService,
  fetchParcelTileLocation as fetchParcelTileLocationService
} from '~/src/server/land-grants/services/land-grants.service.js'
import {
  calculate,
  parcelsGroups,
  parcelsWithActions,
  locateParcelTiles
} from '~/src/server/land-grants/services/land-grants.client.js'
import { clearParcelCache } from '~/src/server/land-grants/services/parcel-cache.js'
import { configState } from '~/src/__mocks__/config-mocks.js'
import { mockApiEndpoint, mockUserContext, withUserContext } from './land-grants.service.test-helpers.js'

const calculateLandActionsPayment = withUserContext(calculateLandActionsPaymentService)
const fetchActionsWithPlannedActions = withUserContext(fetchActionsWithPlannedActionsService)
const fetchParcelsGroups = withUserContext(fetchParcelsGroupsService)
const fetchParcelTileLocation = withUserContext(fetchParcelTileLocationService)

vi.mock('~/src/server/land-grants/services/land-grants.client.js', async (importOriginal) => {
  const { landGrantsClientMockOverrides } = await import('./land-grants.service.test-helpers.js')
  return { ...(await importOriginal()), ...landGrantsClientMockOverrides }
})

vi.mock('~/src/config/nunjucks/filters/format-currency.js')

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigWithState } = await import('~/src/__mocks__/config-mocks.js')
  const { landGrantsApiConfigDefaults } = await import('./land-grants.service.test-helpers.js')
  return mockConfigWithState(landGrantsApiConfigDefaults)
})

describe('land-grants service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calculateLandActionsPayment', () => {
    const PAYMENT_ERROR = 'Error calculating payment. Please try again later.'

    it('should calculate payment and format amount', async () => {
      const mockCalculateResponse = {
        payment: { annualTotalPence: 123456 }
      }
      calculate.mockResolvedValueOnce(mockCalculateResponse)
      formatCurrency.mockReturnValue('£1,234.56')

      const result = await calculateLandActionsPayment({
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
        mockApiEndpoint,
        mockUserContext
      )
      expect(formatCurrency).toHaveBeenCalledWith(1234.56)
      expect(result).toEqual({
        payment: { annualTotalPence: 123456 },
        paymentTotal: '£1,234.56'
      })
    })

    it('should send all parcels and actions in a single calculate request', async () => {
      const mockCalculateResponse = {
        payment: { annualTotalPence: 123400 }
      }
      calculate.mockResolvedValueOnce(mockCalculateResponse)
      formatCurrency.mockReturnValue('£1,234.00')

      const result = await calculateLandActionsPayment({
        landParcels: {
          'SD1234-5678': {
            actionsObj: {
              CLIG3: { value: 2 },
              CSAM3: { value: 4 }
            }
          },
          'CD9999-1111': {
            actionsObj: {
              SCR2: { value: 1 }
            }
          }
        }
      })

      expect(calculate).toHaveBeenCalledTimes(1)
      expect(calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          parcel: [
            {
              sheetId: 'SD1234',
              parcelId: '5678',
              actions: [
                { code: 'CLIG3', quantity: 2 },
                { code: 'CSAM3', quantity: 4 }
              ]
            },
            {
              sheetId: 'CD9999',
              parcelId: '1111',
              actions: [{ code: 'SCR2', quantity: 1 }]
            }
          ]
        }),
        mockApiEndpoint,
        mockUserContext
      )
      expect(formatCurrency).toHaveBeenCalledWith(1234)
      expect(result).toEqual({
        payment: { annualTotalPence: 123400 },
        paymentTotal: '£1,234.00',
        errorMessage: undefined
      })
    })

    it.each([
      ['a zero annual total', { payment: { annualTotalPence: 0 } }, '£0.00', undefined],
      ['no payment object', {}, undefined, PAYMENT_ERROR],
      ['a payment with no annual total', { payment: { total: 0 } }, undefined, PAYMENT_ERROR]
    ])('handles %s', async (_, response, expectedTotal, expectedError) => {
      calculate.mockResolvedValueOnce(response)
      formatCurrency.mockReturnValue('£0.00')

      const result = await calculateLandActionsPayment({ landParcels: { 'SHEET123-PARCEL456': {} } })

      expect(result.paymentTotal).toBe(expectedTotal)
      expect(result.errorMessage).toBe(expectedError)
      // A missing amount must never reach formatCurrency: it would format NaN
      // and render "£NaN" to the user instead of the error message.
      expect(formatCurrency).toHaveBeenCalledTimes(expectedTotal ? 1 : 0)
    })

    it('should propagate API errors', async () => {
      calculate.mockRejectedValueOnce(new Error('API error'))

      await expect(
        calculateLandActionsPayment({
          landParcels: {
            'SHEET123-PARCEL456': {}
          }
        })
      ).rejects.toThrow('API error')
    })
  })

  describe('fetchActionsWithPlannedActions', () => {
    beforeEach(() => {
      clearParcelCache()
      configState.reset()
    })

    it('should recompute availability against plannedActions and return a flat action list', async () => {
      const mockApiResponse = {
        parcels: [
          {
            parcelId: 'PARCEL456',
            sheetId: 'SHEET123',
            actions: [
              { code: 'CMOR1', availability: { value: 8, unit: 'ha' }, description: 'Assess moorland' },
              { code: 'UPL1', availability: { value: 0, unit: 'ha' }, description: 'Moderate grazing' }
            ]
          }
        ]
      }
      parcelsWithActions.mockResolvedValueOnce(mockApiResponse)

      const plannedActions = [{ actionCode: 'CMOR1', quantity: 2, unit: 'ha' }]
      const result = await fetchActionsWithPlannedActions({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123',
        plannedActions
      })

      expect(parcelsWithActions).toHaveBeenCalledWith(
        ['SHEET123-PARCEL456'],
        mockApiEndpoint,
        mockUserContext,
        plannedActions
      )
      expect(result).toEqual({
        actions: [
          { code: 'CMOR1', availability: { value: 8, unit: 'ha' } },
          { code: 'UPL1', availability: { value: 0, unit: 'ha' } }
        ]
      })
    })

    it('should not read from or write to the parcel-actions cache', async () => {
      const mockApiResponse = {
        parcels: [{ parcelId: 'PARCEL456', sheetId: 'SHEET123', actions: [] }]
      }
      parcelsWithActions.mockResolvedValue(mockApiResponse)
      const plannedActions = [{ actionCode: 'CMOR1', quantity: 2, unit: 'ha' }]

      await fetchActionsWithPlannedActions({ parcelId: 'PARCEL456', sheetId: 'SHEET123', plannedActions })
      await fetchActionsWithPlannedActions({ parcelId: 'PARCEL456', sheetId: 'SHEET123', plannedActions })

      expect(parcelsWithActions).toHaveBeenCalledTimes(2)
    })

    it('should return an empty actions array when the parcel is not found', async () => {
      parcelsWithActions.mockResolvedValueOnce({ parcels: [] })

      const result = await fetchActionsWithPlannedActions({
        parcelId: 'PARCEL456',
        sheetId: 'SHEET123',
        plannedActions: []
      })

      expect(result).toEqual({ actions: [] })
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

      expect(parcelsGroups).toHaveBeenCalledWith(['SHEET1-PARCEL1', 'SHEET2-PARCEL2'], mockApiEndpoint, mockUserContext)
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

  describe('fetchParcelTileLocation', () => {
    const mockBbox = { minLng: -2.5, minLat: 51.4, maxLng: -2.3, maxLat: 51.6 }

    it('returns the bbox from the API response', async () => {
      locateParcelTiles.mockResolvedValueOnce({ bbox: mockBbox })

      const result = await fetchParcelTileLocation(['SD7148-9160'])

      expect(result).toEqual(mockBbox)
      expect(locateParcelTiles).toHaveBeenCalledWith(['SD7148-9160'], mockApiEndpoint, mockUserContext)
    })

    it('returns null when the API throws', async () => {
      locateParcelTiles.mockRejectedValueOnce(new Error('timeout'))

      const result = await fetchParcelTileLocation(['SD7148-9160'])

      expect(result).toBeNull()
    })

    it('passes an empty array when no parcel IDs given', async () => {
      locateParcelTiles.mockResolvedValueOnce({ bbox: null })

      const result = await fetchParcelTileLocation([])

      expect(locateParcelTiles).toHaveBeenCalledWith([], mockApiEndpoint, mockUserContext)
      expect(result).toBeNull()
    })
  })
})
