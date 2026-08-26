// @ts-nocheck
import { vi } from 'vitest'
import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'
import { fetchParcelsFromDal } from '~/src/server/common/services/consolidated-view/consolidated-view.service.js'
import {
  calculateLandActionsPayment as calculateLandActionsPaymentService,
  fetchGroupedActionsForParcel as fetchGroupedActionsForParcelService,
  fetchActionsForParcel as fetchActionsForParcelService,
  fetchActionsWithPlannedActions as fetchActionsWithPlannedActionsService,
  fetchConsentRequirementsForParcel as fetchConsentRequirementsForParcelService,
  fetchParcels as fetchParcelsService,
  fetchParcelsGroups as fetchParcelsGroupsService,
  fetchParcelTileLocation as fetchParcelTileLocationService,
  validateApplication as validateApplicationService
} from '~/src/server/land-grants/services/land-grants.service.js'
import {
  calculate,
  parcelsGroups,
  parcelsWithSize,
  parcelsWithGroups,
  parcelsWithActions,
  locateParcelTiles,
  validate
} from '~/src/server/land-grants/services/land-grants.client.js'
import { clearParcelCache } from '~/src/server/land-grants/services/parcel-cache.js'
import { configState } from '~/src/__mocks__/config-mocks.js'

const apiCMOR1 = {
  code: 'CMOR1',
  availability: { value: 10.5, unit: 'ha' },
  description: 'Assess moorland and produce a written record'
}
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
// What the service returns for apiCMOR1 once landActionWithCode has appended the code.
const mappedCMOR1 = { ...apiCMOR1, description: 'Assess moorland and produce a written record: CMOR1' }
const fetchFlat = (enabled = enabledLandActions) =>
  fetchActionsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions: enabled })
const fetchGrouped = (enabled = enabledLandActions) =>
  fetchGroupedActionsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123', enabledLandActions: enabled })
const moorlandAndShepherdingGroups = [
  { name: 'Assess moorland', actions: ['CMOR1'] },
  { name: 'Shepherding livestock on moorland', actions: ['UPL8', 'UPL10'] }
]
const parcelResponse = (actions, groups) => ({
  parcels: [{ parcelId: 'PARCEL456', sheetId: 'SHEET123', size: { value: 50.5, unit: 'ha' }, actions }],
  ...(groups && { groups })
})
const mockApiEndpoint = 'https://land-grants-api'
const enabledLandActions = ['CMOR1', 'UPL1', 'UPL2', 'UPL3', 'UPL8', 'UPL10', 'CLIG3']
const mockUserContext = {
  defraIdToken: 'defra-id-access-token',
  sbi: '123456789'
}
const withUserContext =
  (fn) =>
  (...args) =>
    fn(...args, mockUserContext)
const calculateLandActionsPayment = withUserContext(calculateLandActionsPaymentService)
const fetchGroupedActionsForParcel = withUserContext(fetchGroupedActionsForParcelService)
const fetchActionsForParcel = withUserContext(fetchActionsForParcelService)
const fetchActionsWithPlannedActions = withUserContext(fetchActionsWithPlannedActionsService)
const fetchConsentRequirementsForParcel = withUserContext(fetchConsentRequirementsForParcelService)
const fetchParcels = withUserContext(fetchParcelsService)
const fetchParcelsGroups = withUserContext(fetchParcelsGroupsService)
const fetchParcelTileLocation = withUserContext(fetchParcelTileLocationService)
const validateApplication = withUserContext(validateApplicationService)

vi.mock('~/src/server/land-grants/services/land-grants.client.js', () => ({
  calculate: vi.fn(),
  parcelsGroups: vi.fn(),
  parcelsWithSize: vi.fn(),
  parcelsWithGroups: vi.fn(),
  parcelsWithActions: vi.fn(),
  locateParcelTiles: vi.fn(),
  validate: vi.fn()
}))

vi.mock('~/src/config/nunjucks/filters/format-currency.js')

vi.mock('~/src/config/config.js', async () => {
  const { mockConfigWithState } = await import('~/src/__mocks__/config-mocks.js')
  // Literal, not mockApiEndpoint: this factory runs during the import phase,
  // before the module-level consts below are initialised.
  return mockConfigWithState({ defaults: { 'landGrants.grantsServiceApiEndpoint': 'https://land-grants-api' } })
})

vi.mock('~/src/server/common/services/consolidated-view/consolidated-view.service.js', () => ({
  fetchParcelsFromDal: vi.fn()
}))

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
    const parcelWithActions = (actions) => ({
      parcels: [{ parcelId: 'PARCEL456', sheetId: 'SHEET123', size: { value: 50.5, unit: 'ha' }, actions }]
    })

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
      parcelsWithActions.mockResolvedValueOnce(parcelWithActions(actions))

      const result = await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(result).toEqual({ consents: expected })
    })

    it('should report consents for actions no journey enables', async () => {
      parcelsWithActions.mockResolvedValueOnce(
        parcelWithActions([
          { code: 'CMOR1', description: 'Assess moorland', sssiConsentRequired: true },
          { code: 'UPL2', description: 'Supplementary winter feeding', heferRequired: true }
        ])
      )

      const result = await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(result).toEqual({ consents: ['sssi', 'hefer'] })
    })

    it('should ask the API for the parcel without narrowing to any action list', async () => {
      parcelsWithActions.mockResolvedValueOnce(parcelWithActions([{ code: 'CMOR1', description: 'Assess moorland' }]))

      await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(parcelsWithActions).toHaveBeenCalledWith(['SHEET123-PARCEL456'], mockApiEndpoint, mockUserContext, [])
    })

    it('should omit a key whose feature flag is off, even when the action has the field set', async () => {
      configState.set('landGrants.enableHeferFeature', false)
      parcelsWithActions.mockResolvedValueOnce(
        parcelWithActions([
          { code: 'CMOR1', description: 'Assess moorland', sssiConsentRequired: true, heferRequired: true }
        ])
      )

      const result = await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(result).toEqual({ consents: ['sssi'] })
    })

    it('should cache its own unfiltered lookup rather than calling upstream twice', async () => {
      parcelsWithActions.mockResolvedValue(
        parcelWithActions([{ code: 'CMOR1', description: 'Assess moorland', sssiConsentRequired: true }])
      )

      await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })
      const result = await fetchConsentRequirementsForParcel({ parcelId: 'PARCEL456', sheetId: 'SHEET123' })

      expect(parcelsWithActions).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ consents: ['sssi'] })
    })

    it('should not collide with the journey-filtered cache entry for the same parcel', async () => {
      parcelsWithActions.mockResolvedValue(
        parcelWithActions([
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

      vi.advanceTimersByTime(5 * 60 * 1000 + 1) // just past TTL

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

  describe('fetchParcels', () => {
    const mockRequest = { auth: { credentials: { sbi: '106284736' } } }
    const oneParcel = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1' }]
    const oneParcelSize = {
      parcels: [{ parcelId: 'PARCEL1', sheetId: 'SHEET1', size: { total: 15.5, unit: 'ha' } }]
    }
    const oneParcelWithArea = [{ parcelId: 'PARCEL1', sheetId: 'SHEET1', area: { total: 15.5, unit: 'ha' } }]

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
      expect(parcelsWithSize).toHaveBeenCalledWith(
        ['SHEET1-PARCEL1', 'SHEET2-PARCEL2'],
        mockApiEndpoint,
        mockUserContext
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
      fetchParcelsFromDal.mockResolvedValueOnce(oneParcel)
      parcelsWithSize.mockRejectedValueOnce(new Error('Size API error'))

      await expect(fetchParcels(mockRequest)).rejects.toThrow('Size API error')
    })

    it('should return cached result on second call with same SBI', async () => {
      fetchParcelsFromDal.mockResolvedValue(oneParcel)
      parcelsWithSize.mockResolvedValue(oneParcelSize)

      await fetchParcels(mockRequest)
      const secondResult = await fetchParcels(mockRequest)

      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(1)
      expect(secondResult).toEqual(oneParcelWithArea)
    })

    it('should fetch separately for different SBIs', async () => {
      fetchParcelsFromDal.mockResolvedValue(oneParcel)
      parcelsWithSize.mockResolvedValue(oneParcelSize)

      const otherRequest = { auth: { credentials: { sbi: '999999999' } } }

      await fetchParcels(mockRequest)
      await fetchParcels(otherRequest)

      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)
    })

    it('should re-fetch after cache TTL expires', async () => {
      vi.useFakeTimers()
      fetchParcelsFromDal.mockResolvedValue(oneParcel)
      parcelsWithSize.mockResolvedValue(oneParcelSize)

      await fetchParcels(mockRequest)
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(5 * 60 * 1000 + 1)

      await fetchParcels(mockRequest)
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('should not cache failed API calls', async () => {
      fetchParcelsFromDal.mockRejectedValueOnce(new Error('API error'))
      fetchParcelsFromDal.mockResolvedValueOnce(oneParcel)
      parcelsWithSize.mockResolvedValueOnce(oneParcelSize)

      await expect(fetchParcels(mockRequest)).rejects.toThrow('API error')

      const result = await fetchParcels(mockRequest)
      expect(fetchParcelsFromDal).toHaveBeenCalledTimes(2)
      expect(result).toEqual(oneParcelWithArea)
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

  describe('validateApplication', () => {
    const validationInput = {
      applicationId: '123456',
      crn: '123456',
      state: {
        landParcels: { 'SHEET1-PARCEL1': { actionsObj: { CMOR1: { value: 10 } } } }
      }
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
          landActions: [{ sheetId: 'SHEET1', parcelId: 'PARCEL1', actions: [{ code: 'CMOR1', quantity: 10 }] }]
        },
        mockApiEndpoint,
        mockUserContext
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
