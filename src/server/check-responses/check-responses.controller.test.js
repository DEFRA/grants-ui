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

  describe('getSummaryViewModel - check-details exclusion', () => {
    let mockRequest
    let context

    beforeEach(() => {
      mockRequest = mockSimpleRequest()
      context = mockContext({ state: {} })
    })

    const makeFixture = () =>
      buildViewModel({
        details: [
          {
            name: undefined,
            title: undefined,
            items: [{ name: 'detailsConfirmed', page: { path: '/check-details' }, value: 'Yes' }]
          },
          {
            title: 'About your woodland',
            items: [{ name: 'landParcels', page: { path: '/land-parcels' }, value: 'A, B' }]
          }
        ],
        checkAnswers: [
          {
            title: { text: undefined },
            summaryList: { rows: [{ key: { text: 'Are these details correct?' }, value: { text: 'Yes' } }] }
          },
          {
            title: { text: 'About your woodland' },
            summaryList: { rows: [{ key: { text: 'Select land parcels' }, value: { text: 'A, B' } }] }
          }
        ]
      })

    it('drops the check-details detail/checkAnswers pair and leaves the woodland group intact', () => {
      mockModel.def.pages = [{ path: '/check-details', controller: 'CheckDetailsController' }]
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(makeFixture())

      const ctrl = new CheckResponsesPageController(mockModel, mockPageDef)
      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.details).toHaveLength(1)
      expect(result.details[0].title).toBe('About your woodland')
      expect(result.details[0].items).toHaveLength(1)
      expect(result.details[0].items[0].name).toBe('landParcels')
      expect(result.checkAnswers).toHaveLength(1)
      expect(result.checkAnswers[0].title.text).toBe('About your woodland')
      expect(result.checkAnswers[0].summaryList.rows[0].key.text).toBe('Select land parcels')
    })

    it('passes through unchanged when no CheckDetailsController page exists', () => {
      mockModel.def.pages = [{ path: '/other', controller: 'QuestionPageController' }]
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(makeFixture())

      const ctrl = new CheckResponsesPageController(mockModel, mockPageDef)
      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.details).toHaveLength(2)
      expect(result.checkAnswers).toHaveLength(2)
    })

    it('row-level filter: drops check-details item within a mixed group, keeps the group', () => {
      mockModel.def.pages = [{ path: '/check-details', controller: 'CheckDetailsController' }]
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(
        buildViewModel({
          details: [
            {
              title: undefined,
              items: [
                { name: 'detailsConfirmed', page: { path: '/check-details' }, value: 'Yes' },
                { name: 'otherField', page: { path: '/other' }, value: 'keep me' }
              ]
            }
          ],
          checkAnswers: [
            {
              title: { text: undefined },
              summaryList: {
                rows: [
                  { key: { text: 'Are these details correct?' }, value: { text: 'Yes' } },
                  { key: { text: 'Other' }, value: { text: 'keep me' } }
                ]
              }
            }
          ]
        })
      )

      const ctrl = new CheckResponsesPageController(mockModel, mockPageDef)
      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.details).toHaveLength(1)
      expect(result.details[0].items).toHaveLength(1)
      expect(result.details[0].items[0].name).toBe('otherField')
      expect(result.checkAnswers[0].summaryList.rows).toHaveLength(1)
      expect(result.checkAnswers[0].summaryList.rows[0].key.text).toBe('Other')
    })

    it('applies landParcels substitution at the correct post-filter index', () => {
      mockModel.def.pages = [{ path: '/check-details', controller: 'CheckDetailsController' }]
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(makeFixture())

      const ctrl = new CheckResponsesPageController(mockModel, mockPageDef)
      const result = ctrl.getSummaryViewModel(mockRequest, mockContext({ state: { landParcels: ['X', 'Y'] } }))

      expect(result.checkAnswers[0].summaryList.rows[0].value).toEqual({ html: 'X, Y' })
    })

    it('falls back when model.def.pages is missing', () => {
      mockModel.def = undefined
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(makeFixture())

      const ctrl = new CheckResponsesPageController(mockModel, mockPageDef)
      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.details).toHaveLength(2)
      expect(result.checkAnswers).toHaveLength(2)
    })

    it('handles missing detail.items, missing checkAnswers entry, and missing rows', () => {
      mockModel.def.pages = [{ path: '/check-details', controller: 'CheckDetailsController' }]
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue(
        buildViewModel({
          details: [
            {},
            {
              items: [
                { name: 'detailsConfirmed', page: { path: '/check-details' }, value: 'Yes' },
                { name: 'otherField', page: { path: '/other' }, value: 'keep' }
              ]
            }
          ]
        })
      )

      const ctrl = new CheckResponsesPageController(mockModel, mockPageDef)
      const result = ctrl.getSummaryViewModel(mockRequest, context)

      expect(result.details).toHaveLength(1)
      expect(result.details[0].items).toHaveLength(1)
      expect(result.details[0].items[0].name).toBe('otherField')
      expect(result.checkAnswers).toEqual([])
    })
  })
})
