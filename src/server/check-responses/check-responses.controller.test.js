import { vi } from 'vitest'
import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import CheckResponsesPageController from '~/src/server/check-responses/check-responses.controller.js'
import { mockContext, mockHapiResponseToolkit, mockSimpleRequest } from '~/src/__mocks__/hapi-mocks.js'
import { getTaskPageBackLink } from '../task-list/task-list.helper.js'

const buildViewModel = (overrides = {}) => ({
  serviceUrl: '/service',
  page: { title: 'Summary' },
  ...overrides
})

vi.mock('../task-list/task-list.helper.js', () => ({
  getTaskPageBackLink: vi.fn()
}))

vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () => {
  const defaultViewModel = {
    serviceUrl: '/service',
    page: { title: 'Summary' },
    details: [{ items: [{ name: 'landParcels', value: '' }] }],
    checkAnswers: [
      {
        summaryList: {
          rows: [{ key: { text: 'Select land parcels' }, value: { text: 'Not provided' } }]
        }
      }
    ]
  }
  return {
    SummaryPageController: class {
      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
      }

      getSummaryViewModel() {
        return JSON.parse(JSON.stringify(defaultViewModel))
      }

      getHref(path) {
        return `${this.model.basePath}${path}`
      }
    }
  }
})

describe('CheckResponsesPageController', () => {
  let controller
  let mockModel
  let mockPageDef

  beforeEach(() => {
    vi.clearAllMocks()

    mockModel = {
      basePath: '/test-form',
      getSection: vi.fn((id) => ({ id, title: 'Example Section' })),
      def: { pages: [] }
    }

    mockPageDef = {
      path: '/check-answers',
      title: 'Check your answers',
      section: 'section-id-123'
    }

    controller = new CheckResponsesPageController(mockModel, mockPageDef)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should extend SummaryPageController', () => {
      expect(controller).toBeInstanceOf(SummaryPageController)
    })

    it('should set viewName', () => {
      expect(controller.viewName).toBe('check-responses-page')
    })

    it('should resolve section', () => {
      expect(controller.section).toEqual({
        id: 'section-id-123',
        title: 'Example Section'
      })
    })

    it('should not set section when pageDef has no section', () => {
      const ctrl = new CheckResponsesPageController(mockModel, { path: '/x', title: 'x' })
      expect(ctrl.section).toBeUndefined()
    })
  })

  describe('getSummaryViewModel - land parcels logic', () => {
    let mockRequest

    beforeEach(() => {
      mockRequest = mockSimpleRequest()
    })

    it('should replace land parcels in both details and checkAnswers', () => {
      const context = mockContext({
        state: { landParcels: ['A', 'B'] }
      })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result.checkAnswers[0].summaryList.rows[0].value).toEqual({
        html: 'A, B'
      })
    })

    it('should not modify when landParcels is missing', () => {
      const context = mockContext({ state: {} })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result.details[0].items[0].value).toBe('')
      expect(result.checkAnswers[0].summaryList.rows[0].value).toEqual({
        text: 'Not provided'
      })
    })

    it('should not modify when landParcels is empty array', () => {
      const context = mockContext({ state: { landParcels: [] } })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result.checkAnswers[0].summaryList.rows[0].value).toEqual({
        text: 'Not provided'
      })
    })

    it.each([
      ['details is undefined', buildViewModel({ checkAnswers: [] })],
      ['items is undefined', buildViewModel({ details: [{}], checkAnswers: [] })]
    ])('should not throw when %s', (_label, returnValue) => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(returnValue)
      const context = mockContext({ state: { landParcels: ['A'] } })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result).toBeDefined()
    })

    it('should not modify when landParcels item is not found', () => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(
        buildViewModel({
          details: [{ items: [{ name: 'otherField', value: 'X' }] }],
          checkAnswers: [{ summaryList: { rows: [{ value: { text: 'Original' } }] } }]
        })
      )

      const context = mockContext({
        state: { landParcels: ['A'] }
      })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result.checkAnswers[0].summaryList.rows[0].value).toEqual({
        text: 'Original'
      })
    })

    it('should replace structured land parcels with the shared land and actions summary model', () => {
      const context = mockContext({
        state: {
          landParcels: {
            'SD1234-5678': { actionsObj: { CLIG3: { value: 2, unit: 'ha' } } }
          },
          payment: {
            annualTotalPence: 10000,
            parcelItems: {
              1: {
                code: 'CLIG3',
                description: 'Action description',
                sheetId: 'SD1234',
                parcelId: '5678',
                quantity: 2,
                unit: 'ha',
                annualPaymentPence: 10000
              }
            }
          },
          agreementStartDate: '2026-02-01',
          agreementEndDate: '2029-02-01',
          agreementTotalPence: 30000
        }
      })

      const result = controller.getSummaryViewModel(mockRequest, context)
      const summary = result.checkAnswers[0].landAndActionsSummary

      expect(result.details[0].items).toEqual([])
      expect(result.checkAnswers[0].summaryList.rows).toEqual([])
      expect(summary.changeHref).toBe('/test-form/confirm-land-and-actions')
      expect(summary.parcels[0]).toMatchObject({
        reference: 'SD1234 5678',
        yearlyPayment: '£100.00',
        actions: [{ action: 'Action description (CLIG3)', area: '2.0000 ha', yearlyPayment: '£100.00' }]
      })
      expect(summary.applicationYearlyPayment).toBe('£100.00')
      expect(summary.agreementDuration).toBe('3 years')
      expect(summary.agreementDurationYears).toBe(3)
      expect(summary.agreementTotalPayment).toBe('£300.00')
    })

    it('should replace the hidden display field used by a configured map-select page', () => {
      mockModel.def.pages = [{ path: '/select-land-parcel', controller: 'MapSelectPageController' }]
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(
        buildViewModel({
          details: [
            {
              items: [
                {
                  name: 'selectedParcelsDisplay',
                  page: { path: '/select-land-parcel' },
                  value: 'SD1234-5678'
                }
              ]
            }
          ],
          checkAnswers: [
            {
              summaryList: {
                rows: [{ key: { text: 'Select the land and actions' }, value: { text: 'SD1234-5678' } }]
              }
            }
          ]
        })
      )
      const context = mockContext({
        state: {
          landParcels: { 'SD1234-5678': { actionsObj: { CLIG3: {} } } },
          payment: {
            annualTotalPence: 10000,
            parcelItems: {
              1: {
                code: 'CLIG3',
                description: 'Action description',
                sheetId: 'SD1234',
                parcelId: '5678',
                quantity: 2,
                unit: 'ha',
                annualPaymentPence: 10000
              }
            }
          }
        }
      })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result.details[0].items).toEqual([])
      expect(result.checkAnswers[0].summaryList.rows).toEqual([])
      expect(result.checkAnswers[0].landAndActionsSummary.parcels[0].reference).toBe('SD1234 5678')
      expect(result.checkAnswers[0].landAndActionsSummary.applicationYearlyPayment).toBe('£100.00')
    })

    it('should retain the engine answer when structured land parcels have no saved payment', () => {
      const context = mockContext({
        state: { landParcels: { 'SD1234-5678': { actionsObj: {} } } }
      })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result.details[0].items).toHaveLength(1)
      expect(result.checkAnswers[0].summaryList.rows).toHaveLength(1)
      expect(result.checkAnswers[0].landAndActionsSummary).toBeUndefined()
    })
  })

  describe('getSummaryViewModel - config.additionalSections', () => {
    let mockRequest

    beforeEach(() => {
      mockRequest = mockSimpleRequest()
    })

    const buildControllerWithAdditionalSections = (additionalSections) =>
      new CheckResponsesPageController(
        {
          ...mockModel,
          def: {
            ...mockModel.def,
            metadata: {
              pageConfig: {
                [mockPageDef.path]: { additionalSections }
              }
            }
          }
        },
        mockPageDef
      )

    it('should append a section built from configured state values', () => {
      const ctrl = buildControllerWithAdditionalSections([
        {
          title: 'Payment summary',
          items: [{ title: 'Annual payment for all parcels', stateValue: 'totalPayment' }]
        }
      ])

      const context = mockContext({ state: { totalPayment: '£374.00' } })

      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.checkAnswers).toHaveLength(2)
      expect(result.checkAnswers[1]).toEqual({
        title: { text: 'Payment summary' },
        summaryList: {
          rows: [{ key: { text: 'Annual payment for all parcels' }, value: { text: '£374.00' } }]
        }
      })
    })

    it('should show "Not provided" when the configured stateValue is missing from state', () => {
      const ctrl = buildControllerWithAdditionalSections([
        {
          title: 'Payment summary',
          items: [{ title: 'Annual payment for all parcels', stateValue: 'totalPayment' }]
        }
      ])

      const context = mockContext({ state: {} })

      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.checkAnswers[1].summaryList.rows[0].value).toEqual({ text: 'Not provided' })
    })

    it('should not modify checkAnswers when no additionalSections are configured', () => {
      const context = mockContext({ state: {} })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result.checkAnswers).toHaveLength(1)
    })

    it('should not throw when additionalSections config is not an array', () => {
      const ctrl = buildControllerWithAdditionalSections('not-an-array')
      const context = mockContext({ state: {} })

      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.checkAnswers).toHaveLength(1)
    })

    it('should not duplicate a configured totalPayment section when the shared payment card is present', () => {
      const ctrl = buildControllerWithAdditionalSections([
        {
          title: 'Payment summary',
          items: [{ title: 'Annual payment for all parcels', stateValue: 'totalPayment' }]
        }
      ])
      const context = mockContext({
        state: {
          landParcels: { 'SD1234-5678': { actionsObj: { CLIG3: {} } } },
          payment: {
            annualTotalPence: 10000,
            parcelItems: {
              1: {
                code: 'CLIG3',
                description: 'Action description',
                sheetId: 'SD1234',
                parcelId: '5678',
                quantity: 2,
                unit: 'ha',
                annualPaymentPence: 10000
              }
            }
          },
          totalPayment: '£100.00'
        }
      })

      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.checkAnswers).toHaveLength(1)
      expect(result.checkAnswers[0].landAndActionsSummary.applicationYearlyPayment).toBe('£100.00')
    })
  })

  describe('getSummaryViewModel - general behaviour', () => {
    let mockRequest
    let context

    beforeEach(() => {
      mockRequest = mockSimpleRequest()
      context = mockContext({ state: {} })
    })

    it('should add sectionTitle', () => {
      const result = controller.getSummaryViewModel(mockRequest, context)
      expect(result.sectionTitle).toBe('Example Section')
    })

    it('should hide sectionTitle when hideTitle is true', () => {
      mockModel.getSection = vi.fn().mockReturnValue({
        title: 'Hidden',
        hideTitle: true
      })

      const ctrl = new CheckResponsesPageController(mockModel, mockPageDef)

      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.sectionTitle).toBe('')
    })

    it('should include backLink when provided', () => {
      getTaskPageBackLink.mockReturnValue({ href: '/x', text: 'Back' })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result.backLink).toEqual({ href: '/x', text: 'Back' })
    })

    it('should not include backLink when null', () => {
      getTaskPageBackLink.mockReturnValue(null)

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result.backLink).toBeUndefined()
    })
  })

  describe('makePostRouteHandler', () => {
    it('should call proceed with next path', async () => {
      const handler = controller.makePostRouteHandler()

      const request = mockSimpleRequest()
      const context = mockContext()
      const h = mockHapiResponseToolkit()

      controller.getNextPath = vi.fn().mockReturnValue('/next')
      controller.proceed = vi.fn().mockReturnValue('ok')

      const result = await handler(request, context, h)

      expect(controller.proceed).toHaveBeenCalledWith(request, h, '/next')
      expect(result).toBe('ok')
    })
  })

  describe('getSummaryViewModel - check-details summary', () => {
    let mockRequest

    beforeEach(() => {
      mockRequest = mockSimpleRequest()
    })

    const makeFixture = () =>
      buildViewModel({
        details: [
          {
            title: undefined,
            items: [
              {
                name: 'businessDetailsUpToDate',
                page: { path: '/check-details' },
                value: 'Yes'
              }
            ]
          },
          {
            title: 'About your woodland',
            items: [{ name: 'landParcels', page: { path: '/land-parcels' }, value: 'A, B' }]
          }
        ],
        checkAnswers: [
          {
            title: { text: undefined },
            summaryList: {
              rows: [
                {
                  key: { text: 'Are these details correct?' },
                  value: { text: 'Yes' },
                  actions: {
                    items: [
                      {
                        href: '/test-form/check-details',
                        text: 'Change',
                        visuallyHiddenText: 'Are these details correct?'
                      }
                    ]
                  }
                }
              ]
            }
          },
          {
            title: { text: 'About your woodland' },
            summaryList: { rows: [{ key: { text: 'Select land parcels' }, value: { text: 'A, B' } }] }
          }
        ]
      })

    it('retains the details confirmation section alongside the land and actions summary', () => {
      mockModel.def.pages = [{ path: '/check-details', controller: 'CheckDetailsController' }]
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(makeFixture())

      const context = mockContext({
        state: {
          businessDetailsUpToDate: true,
          landParcels: {
            'SD1234-5678': { actionsObj: { CLIG3: { value: 2, unit: 'ha' } } }
          },
          payment: {
            annualTotalPence: 10000,
            parcelItems: {
              1: {
                code: 'CLIG3',
                description: 'Action description',
                sheetId: 'SD1234',
                parcelId: '5678',
                quantity: 2,
                unit: 'ha',
                annualPaymentPence: 10000
              }
            }
          },
          agreementStartDate: '2026-02-01',
          agreementEndDate: '2029-02-01',
          agreementTotalPence: 30000
        }
      })

      const ctrl = new CheckResponsesPageController(mockModel, mockPageDef)
      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.details).toHaveLength(2)
      expect(result.details[0].items[0]).toMatchObject({
        name: 'businessDetailsUpToDate',
        page: { path: '/check-details' },
        value: 'Yes'
      })
      expect(result.checkAnswers[0]).toMatchObject({
        title: { text: undefined },
        summaryList: {
          rows: [
            {
              key: { text: 'Are these details correct?' },
              value: { text: 'Yes' },
              actions: {
                items: [{ href: '/test-form/check-details', text: 'Change' }]
              }
            }
          ]
        }
      })
      expect(result.checkAnswers[1].landAndActionsSummary).toMatchObject({
        changeHref: '/test-form/confirm-land-and-actions',
        parcels: [{ reference: 'SD1234 5678' }]
      })
      expect(result.details[1].items).toEqual([])
      expect(result.checkAnswers[1].summaryList.rows).toEqual([])
    })
  })
})
