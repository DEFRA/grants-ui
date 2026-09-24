import { vi } from 'vitest'
import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import CheckResponsesPageController from '~/src/server/check-responses/check-responses.controller.js'
import {
  mockContext as createMockContext,
  mockHapiResponseToolkit,
  mockSimpleRequest
} from '~/src/__mocks__/hapi-mocks.js'
import { getTaskPageBackLink } from '../task-list/task-list.helper.js'

const mockContext = (overrides = {}) => createMockContext({ relevantPages: [], ...overrides })

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

      get path() {
        return this.pageDef.path
      }

      getSummaryViewModel() {
        return JSON.parse(JSON.stringify(defaultViewModel))
      }

      getRelevantPath() {
        return this.pageDef.path
      }

      makeGetRouteHandler() {
        return (request, context, h) => h.view(this.viewName, this.getSummaryViewModel(request, context))
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

  describe('derived state navigation', () => {
    let derivedPage
    let context
    let h

    beforeEach(() => {
      derivedPage = { path: '/total-estimated-cost', isStateStale: vi.fn().mockReturnValue(true) }
      mockModel.def.metadata = {
        pageConfig: { [mockPageDef.path]: { derivedStatePages: [derivedPage.path] } }
      }
      controller = new CheckResponsesPageController(mockModel, mockPageDef)
      context = mockContext({ state: {}, relevantPages: [derivedPage] })
      h = mockHapiResponseToolkit()
    })

    it.each([
      ['get', 'makeGetRouteHandler', 302],
      ['post', 'makePostRouteHandler', 303]
    ])('redirects a stale %s request with an explicit return URL', async (method, factory, status) => {
      const request = mockSimpleRequest({ method })
      const response = await controller[factory]()(request, context, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-form/total-estimated-cost?returnUrl=%2Ftest-form%2Fcheck-answers')
      expect(response.code).toHaveBeenCalledWith(status)
      expect(derivedPage.isStateStale).toHaveBeenCalledWith(request, context)
    })

    it('does not check or redirect to an excluded derived page', async () => {
      context.relevantPages = []
      mockModel.pageMap = new Map([[derivedPage.path, derivedPage]])

      await controller.makeGetRouteHandler()(mockSimpleRequest(), context, h)

      expect(derivedPage.isStateStale).not.toHaveBeenCalled()
      expect(h.redirect).not.toHaveBeenCalled()
      expect(h.view).toHaveBeenCalled()
    })

    it('renders Check answers when derived state is current', async () => {
      derivedPage.isStateStale.mockResolvedValue(false)

      await controller.makeGetRouteHandler()(mockSimpleRequest(), context, h)

      expect(h.redirect).not.toHaveBeenCalled()
      expect(h.view).toHaveBeenCalled()
    })

    it.each([
      ['get', 'makeGetRouteHandler'],
      ['post', 'makePostRouteHandler']
    ])('awaits an automatic refresh before continuing a %s request', async (method, factory) => {
      const refreshed = { additionalAnswers: { total: 500 } }
      derivedPage.derivedState = { requiresAcknowledgement: false }
      derivedPage.isStateStale.mockResolvedValue(true)
      derivedPage.refreshState = vi.fn().mockResolvedValue(refreshed)
      controller.getNextPath = vi.fn().mockReturnValue('/declaration')
      controller.proceed = vi.fn()

      await controller[factory]()(mockSimpleRequest({ method }), context, h)

      expect(context.state).toBe(refreshed)
      expect(derivedPage.refreshState).toHaveBeenCalledTimes(1)
      expect(h.redirect).not.toHaveBeenCalled()
      if (method === 'get') {
        expect(h.view).toHaveBeenCalled()
      } else {
        expect(controller.proceed).toHaveBeenCalled()
      }
    })

    it('uses the refreshed state when checking the next configured calculation', async () => {
      const refreshed = { additionalAnswers: { total: 500 } }
      derivedPage.derivedState = { requiresAcknowledgement: false }
      derivedPage.refreshState = vi.fn().mockResolvedValue(refreshed)
      const dependent = {
        path: '/dependent-result',
        isStateStale: vi.fn((_request, ctx) => ctx.state.additionalAnswers.total === 500)
      }
      context.relevantPages.push(dependent)
      controller.derivedStatePages.push(dependent.path)

      await controller.makeGetRouteHandler()(mockSimpleRequest({ method: 'get' }), context, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-form/dependent-result?returnUrl=%2Ftest-form%2Fcheck-answers')
    })

    it('does not render or proceed when automatic calculation fails', async () => {
      derivedPage.derivedState = { requiresAcknowledgement: false }
      derivedPage.refreshState = vi.fn().mockRejectedValue(new Error('Calculation failed'))

      await expect(controller.makeGetRouteHandler()(mockSimpleRequest(), context, h)).rejects.toThrow(
        'Calculation failed'
      )
      expect(h.view).not.toHaveBeenCalled()
      expect(h.redirect).not.toHaveBeenCalled()
      expect(context.state).toEqual({})
    })

    it('preserves forced preview access', async () => {
      context.isForceAccess = true

      await controller.makeGetRouteHandler()(mockSimpleRequest(), context, h)

      expect(derivedPage.isStateStale).not.toHaveBeenCalled()
      expect(h.redirect).not.toHaveBeenCalled()
      expect(h.view).toHaveBeenCalled()
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

    it.each([
      ['a calculated cost', { additionalAnswers: { totalEstimatedCost: 800 } }, 800],
      ['a zero cost', { additionalAnswers: { totalEstimatedCost: 0 } }, 0],
      ['a missing parent', {}, 'Not provided'],
      ['a null parent', { additionalAnswers: null }, 'Not provided'],
      ['a missing value', { additionalAnswers: {} }, 'Not provided'],
      ['a null value', { additionalAnswers: { totalEstimatedCost: null } }, 'Not provided']
    ])('should resolve a nested state path with %s', (_description, state, expected) => {
      const ctrl = buildControllerWithAdditionalSections([
        {
          title: 'Cost',
          items: [{ title: 'Total Estimated Cost', stateValue: 'additionalAnswers.totalEstimatedCost' }]
        }
      ])

      const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state }))

      expect(result.checkAnswers[1]).toEqual({
        title: { text: 'Cost' },
        summaryList: {
          rows: [{ key: { text: 'Total Estimated Cost' }, value: { text: expected } }]
        }
      })
    })

    describe('owning page sections', () => {
      const costsSection = { name: 'estimated-costs', title: 'Estimated costs' }
      const otherSection = { name: 'other', title: 'Other answers' }
      const costItem = { title: 'Total Estimated Cost', stateValue: 'additionalAnswers.totalEstimatedCost' }
      const costRow = { key: { text: 'Total Estimated Cost' }, value: { text: 800 } }
      const state = { additionalAnswers: { totalEstimatedCost: 800 } }
      const mockContext = (overrides = {}) => createMockContext({ relevantPages: mockModel.def.pages, ...overrides })

      const mockSummary = (sections) => {
        vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue({
          details: sections.map((section) => ({
            name: section?.name,
            items: [{ name: 'existingAnswer', page: { section, path: '/another-page' } }]
          })),
          checkAnswers: sections.map((section) => ({
            title: section ? { text: section.title } : undefined,
            summaryList: { rows: [{ key: { text: 'Existing answer' }, value: { text: 'Yes' } }] }
          }))
        })
      }

      beforeEach(() => {
        mockModel.sections = [costsSection, otherSection]
        mockModel.getSection = vi.fn((name) => mockModel.sections.find((section) => section.name === name))
        mockModel.def.pages = [{ path: '/total-estimated-cost', section: 'estimated-costs' }]
        mockSummary([costsSection, otherSection])
      })

      it.each(['total-estimated-cost', '/total-estimated-cost'])(
        'should append to the owning section for page %s',
        (page) => {
          const ctrl = buildControllerWithAdditionalSections([{ page, items: [costItem] }])

          const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state }))

          expect(result.checkAnswers).toHaveLength(2)
          expect(result.checkAnswers[0].title).toEqual({ text: 'Estimated costs' })
          expect(result.checkAnswers[0].summaryList.rows).toHaveLength(2)
          expect(result.checkAnswers[0].summaryList.rows[1]).toEqual(costRow)
          expect(result.checkAnswers[1].summaryList.rows).toHaveLength(1)
        }
      )

      it('should create a missing section in form order and reuse it for subsequent entries', () => {
        mockSummary([otherSection])
        const ctrl = buildControllerWithAdditionalSections([
          { title: 'Separate section', items: [costItem] },
          { page: 'total-estimated-cost', items: [costItem] },
          { page: 'total-estimated-cost', items: [costItem] },
          { page: 'other-page', items: [costItem] }
        ])
        mockModel.def.pages.push({ path: '/other-page', section: 'other' })

        const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state }))

        expect(result.checkAnswers.map((section) => section.title.text)).toEqual([
          'Estimated costs',
          'Other answers',
          'Separate section'
        ])
        expect(result.checkAnswers[0].summaryList.rows).toEqual([costRow, costRow])
        expect(result.checkAnswers[1].summaryList.rows[1]).toEqual(costRow)
      })

      it('should create a section when there are no existing answers', () => {
        mockSummary([])
        const ctrl = buildControllerWithAdditionalSections([{ page: 'total-estimated-cost', items: [costItem] }])

        const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state }))

        expect(result.checkAnswers).toEqual([{ title: { text: 'Estimated costs' }, summaryList: { rows: [costRow] } }])
      })

      it('should match sections identified by ID instead of name', () => {
        const section = { id: 'cost-section-id', title: 'Estimated costs' }
        mockModel.sections = [section]
        mockModel.getSection = vi.fn((id) => mockModel.sections.find((candidate) => candidate.id === id))
        mockModel.def.pages[0].section = section.id
        mockSummary([section])
        const ctrl = buildControllerWithAdditionalSections([{ page: 'total-estimated-cost', items: [costItem] }])

        const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state }))

        expect(result.checkAnswers).toHaveLength(1)
        expect(result.checkAnswers[0].summaryList.rows[1]).toEqual(costRow)
      })

      it('should append unsectioned page values to the unsectioned answers', () => {
        delete mockModel.def.pages[0].section
        mockSummary([costsSection, undefined])
        const ctrl = buildControllerWithAdditionalSections([{ page: 'total-estimated-cost', items: [costItem] }])

        const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state }))

        expect(result.checkAnswers).toHaveLength(2)
        expect(result.checkAnswers[0].summaryList.rows).toHaveLength(1)
        expect(result.checkAnswers[1].summaryList.rows[1]).toEqual(costRow)
      })

      it('should keep an explicit title as a separate section even when page is supplied', () => {
        const ctrl = buildControllerWithAdditionalSections([
          { title: 'Cost', page: 'total-estimated-cost', items: [costItem] }
        ])

        const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state }))

        expect(result.checkAnswers).toHaveLength(3)
        expect(result.checkAnswers[0].summaryList.rows).toHaveLength(1)
        expect(result.checkAnswers[2]).toEqual({ title: { text: 'Cost' }, summaryList: { rows: [costRow] } })
      })

      it.each([undefined, 'Cost'])('omits an excluded owning page with title %s', (title) => {
        mockSummary([otherSection])
        const ctrl = buildControllerWithAdditionalSections([{ title, page: 'total-estimated-cost', items: [costItem] }])

        const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state, relevantPages: [] }))

        expect(result.checkAnswers).toEqual([
          {
            title: { text: 'Other answers' },
            summaryList: { rows: [{ key: { text: 'Existing answer' }, value: { text: 'Yes' } }] }
          }
        ])
      })

      it('does not append excluded page values to an existing section', () => {
        const ctrl = buildControllerWithAdditionalSections([{ page: 'total-estimated-cost', items: [costItem] }])

        const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state, relevantPages: [] }))

        expect(result.checkAnswers).toHaveLength(2)
        expect(result.checkAnswers.every((answer) => answer.summaryList.rows.length === 1)).toBe(true)
      })

      it.each([
        ['unknown page', '/missing-page', 'estimated-costs'],
        ['unknown section', '/total-estimated-cost', 'missing-section']
      ])('should skip an %s reference', (_description, path, section) => {
        mockModel.def.pages = [{ path, section }]
        const ctrl = buildControllerWithAdditionalSections([{ page: 'total-estimated-cost', items: [costItem] }])

        const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state }))

        expect(result.checkAnswers).toHaveLength(2)
        expect(result.checkAnswers.every((answer) => answer.summaryList.rows.length === 1)).toBe(true)
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

    it.each([undefined, false])('hides the details confirmation when showDetailsConfirmation is %s', (configured) => {
      mockModel.def.pages = [{ path: '/check-details', controller: 'CheckDetailsController' }]
      if (configured !== undefined) {
        mockModel.def.metadata = { pageConfig: { [mockPageDef.path]: { showDetailsConfirmation: configured } } }
      }
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(makeFixture())
      const ctrl = new CheckResponsesPageController(mockModel, mockPageDef)

      const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state: { landParcels: ['C'] } }))

      expect(result.details.map((detail) => detail.items.map((item) => item.name))).toEqual([['landParcels']])
      expect(result.checkAnswers.map((section) => section.summaryList.rows)).toEqual([
        [{ key: { text: 'Select land parcels' }, value: { html: 'C' } }]
      ])
    })

    it('preserves other answers in the same section as a hidden details confirmation', () => {
      mockModel.def.pages = [{ path: '/check-details', controller: 'CheckDetailsController' }]
      const fixture = makeFixture()
      fixture.details[0].items.push({ name: 'otherAnswer', page: { path: '/other-question' }, value: 'Other value' })
      const otherRow = { key: { text: 'Other question' }, value: { text: 'Other value' } }
      fixture.checkAnswers[0].summaryList.rows.push(otherRow)
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(fixture)
      const ctrl = new CheckResponsesPageController(mockModel, mockPageDef)

      const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state: { landParcels: ['C'] } }))

      expect(result.details.map((detail) => detail.items.map((item) => item.name))).toEqual([
        ['otherAnswer'],
        ['landParcels']
      ])
      expect(result.checkAnswers.map((section) => section.summaryList.rows)).toEqual([
        [otherRow],
        [{ key: { text: 'Select land parcels' }, value: { html: 'C' } }]
      ])
    })

    it('retains the details confirmation section alongside the land and actions summary', () => {
      mockModel.def.pages = [{ path: '/check-details', controller: 'CheckDetailsController' }]
      mockModel.def.metadata = { pageConfig: { [mockPageDef.path]: { showDetailsConfirmation: true } } }
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
