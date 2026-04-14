import { vi } from 'vitest'
import { SummaryPageController } from '@defra/forms-engine-plugin/controllers/SummaryPageController.js'
import { existsSync } from 'fs'
import { join } from 'path'
import CheckResponsesPageController from '~/src/server/check-responses/check-responses.controller.js'
import { mockContext, mockHapiResponseToolkit, mockSimpleRequest } from '~/src/__mocks__/hapi-mocks.js'
import { getTaskPageBackLink } from '../task-list/task-list.helper.js'

vi.mock('../task-list/task-list.helper.js', () => ({
  getTaskPageBackLink: vi.fn()
}))

vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () => {
  return {
    SummaryPageController: class {
      constructor(model, pageDef) {
        this.model = model
        this.pageDef = pageDef
      }

      getSummaryViewModel() {
        return JSON.parse(
          JSON.stringify({
            serviceUrl: '/service',
            page: { title: 'Summary' },
            details: [
              {
                items: [
                  {
                    name: 'landParcels',
                    value: ''
                  }
                ]
              }
            ],
            checkAnswers: [
              {
                summaryList: {
                  rows: [
                    {
                      key: { text: 'Select land parcels' },
                      value: { text: 'Not provided' }
                    }
                  ]
                }
              }
            ]
          })
        )
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
      getSection: vi.fn((id) => ({ id, title: 'Example Section' }))
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

    it('should not throw when details is undefined', () => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue({
        serviceUrl: '/service',
        page: { title: 'Summary' },
        checkAnswers: []
      })

      const context = mockContext({
        state: { landParcels: ['A'] }
      })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result).toBeDefined()
    })

    it('should not throw when items is undefined', () => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue({
        serviceUrl: '/service',
        page: { title: 'Summary' },
        details: [{}],
        checkAnswers: []
      })

      const context = mockContext({
        state: { landParcels: ['A'] }
      })

      const result = controller.getSummaryViewModel(mockRequest, context)

      expect(result).toBeDefined()
    })

    it('should not modify when landParcels item is not found', () => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue({
        serviceUrl: '/service',
        page: { title: 'Summary' },
        details: [
          {
            items: [{ name: 'otherField', value: 'X' }]
          }
        ],
        checkAnswers: [
          {
            summaryList: {
              rows: [{ value: { text: 'Original' } }]
            }
          }
        ]
      })

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

  describe('view file existence', () => {
    it('should exist', () => {
      const viewPath = join(process.cwd(), 'src/server/check-responses/views/check-responses-page.html')
      expect(existsSync(viewPath)).toBe(true)
    })
  })
})
