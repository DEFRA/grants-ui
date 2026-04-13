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

      getSummaryViewModel(request, context) {
        return {
          serviceUrl: '/service',
          page: {
            title: 'Summary'
          },
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
        }
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

    it('should set viewName to check-responses-page', () => {
      expect(controller.viewName).toBe('check-responses-page')
    })

    it('should call parent constructor', () => {
      expect(controller.model).toBe(mockModel)
      expect(controller.pageDef).toBe(mockPageDef)
    })

    it('should resolve section when pageDef has section property', () => {
      const getSectionSpy = vi.spyOn(mockModel, 'getSection')
      const controllerWithSection = new CheckResponsesPageController(mockModel, mockPageDef)

      expect(controllerWithSection.section).toEqual({
        id: 'section-id-123',
        title: 'Example Section'
      })
      expect(getSectionSpy).toHaveBeenCalledWith('section-id-123')
    })

    it('should not resolve section when pageDef has no section property', () => {
      const pageDefWithoutSection = {
        path: '/check-answers',
        title: 'Check your answers'
      }
      const controllerWithoutSection = new CheckResponsesPageController(mockModel, pageDefWithoutSection)

      expect(controllerWithoutSection.section).toBeUndefined()
    })
  })

  describe('getSummaryViewModel', () => {
    let mockRequest
    let mockContextObj

    beforeEach(() => {
      mockRequest = mockSimpleRequest()
      mockContextObj = mockContext({ state: {} })
    })

    it('should not throw when checkAnswers is undefined', () => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue({
        serviceUrl: '/service',
        page: { title: 'Summary' }
        // no checkAnswers
      })

      const contextWithDisplay = mockContext({
        state: { landParcelsDisplay: 'Parcel A' }
      })

      const result = controller.getSummaryViewModel(mockRequest, contextWithDisplay)

      expect(result).toBeDefined()
    })

    it('should skip section when rows are undefined', () => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue({
        serviceUrl: '/service',
        page: { title: 'Summary' },
        checkAnswers: [
          {
            summaryList: {
              // rows missing
            }
          }
        ]
      })

      const contextWithDisplay = mockContext({
        state: { landParcelsDisplay: 'Parcel A' }
      })

      const result = controller.getSummaryViewModel(mockRequest, contextWithDisplay)

      expect(result).toBeDefined()
    })

    it('should replace land parcels value when landParcelsDisplay exists in state', () => {
      const contextWithDisplay = mockContext({
        state: {
          landParcelsDisplay: 'Parcel A, Parcel B'
        }
      })

      const result = controller.getSummaryViewModel(mockRequest, contextWithDisplay)

      expect(result.checkAnswers[0].summaryList.rows[0].value).toEqual({
        text: 'Parcel A, Parcel B'
      })
    })

    it('should not modify land parcels row when landParcelsDisplay is missing', () => {
      const result = controller.getSummaryViewModel(mockRequest, mockContextObj)

      expect(result.checkAnswers[0].summaryList.rows[0].value).toEqual({
        text: 'Not provided'
      })
    })

    it('should not throw if land parcels row is not present', () => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue({
        serviceUrl: '/service',
        page: { title: 'Summary' },
        checkAnswers: [
          {
            summaryList: {
              rows: [
                {
                  key: { text: 'Something else' },
                  value: { text: 'Value' }
                }
              ]
            }
          }
        ]
      })

      const contextWithDisplay = mockContext({
        state: { landParcelsDisplay: 'Parcel A' }
      })

      const result = controller.getSummaryViewModel(mockRequest, contextWithDisplay)

      expect(result.checkAnswers[0].summaryList.rows[0].value).toEqual({
        text: 'Value'
      })
    })

    it('should call parent getSummaryViewModel and add section title', () => {
      const result = controller.getSummaryViewModel(mockRequest, mockContextObj)

      expect(result.serviceUrl).toBe('/service')
      expect(result.page.title).toBe('Summary')
      expect(result.sectionTitle).toBe('Example Section')
    })

    it('should include backLink when getTaskPageBackLink returns a value', () => {
      getTaskPageBackLink.mockReturnValue({ href: '/task-list', text: 'Back to task list' })

      const result = controller.getSummaryViewModel(mockRequest, mockContextObj)

      expect(getTaskPageBackLink).toHaveBeenCalledWith(
        {
          serviceUrl: '/service',
          checkAnswers: [
            {
              summaryList: {
                rows: [
                  {
                    key: {
                      text: 'Select land parcels'
                    },
                    value: {
                      text: 'Not provided'
                    }
                  }
                ]
              }
            }
          ],
          page: {
            title: 'Summary'
          }
        },
        mockPageDef
      )
      expect(result.backLink).toEqual({ href: '/task-list', text: 'Back to task list' })
    })

    it('should not include backLink when getTaskPageBackLink returns null', () => {
      getTaskPageBackLink.mockReturnValue(null)

      const result = controller.getSummaryViewModel(mockRequest, mockContextObj)

      expect(result.backLink).toBeUndefined()
    })

    it('should not include backLink when getTaskPageBackLink returns undefined', () => {
      getTaskPageBackLink.mockReturnValue(undefined)

      const result = controller.getSummaryViewModel(mockRequest, mockContextObj)

      expect(result.backLink).toBeUndefined()
    })

    it('should set sectionTitle to empty string when section has hideTitle set to true', () => {
      mockModel.getSection = vi.fn().mockReturnValue({
        id: 'section-id-123',
        title: 'Example Section',
        hideTitle: true
      })
      const controllerWithHiddenTitle = new CheckResponsesPageController(mockModel, mockPageDef)

      const result = controllerWithHiddenTitle.getSummaryViewModel(mockRequest, mockContextObj)

      expect(result.sectionTitle).toBe('')
    })

    it('should set sectionTitle to undefined when section is undefined', () => {
      const pageDefWithoutSection = {
        path: '/check-answers',
        title: 'Check your answers'
      }
      const controllerWithoutSection = new CheckResponsesPageController(mockModel, pageDefWithoutSection)

      const result = controllerWithoutSection.getSummaryViewModel(mockRequest, mockContextObj)

      expect(result.sectionTitle).toBeUndefined()
    })

    it('should preserve all parent view model properties', () => {
      vi.spyOn(SummaryPageController.prototype, 'getSummaryViewModel').mockReturnValue({
        serviceUrl: '/service',
        page: { title: 'Summary' },
        otherProperty: 'value',
        anotherProperty: 123
      })

      const result = controller.getSummaryViewModel(mockRequest, mockContextObj)

      expect(result.serviceUrl).toBe('/service')
      expect(result.page.title).toBe('Summary')
      expect(result.otherProperty).toBe('value')
      expect(result.anotherProperty).toBe(123)
      expect(result.sectionTitle).toBe('Example Section')
    })
  })

  describe('makePostRouteHandler', () => {
    let handler

    beforeEach(async () => {
      handler = controller.makePostRouteHandler()
    })

    it('should return a function', () => {
      expect(typeof handler).toBe('function')
    })

    it('should call getNextPath with context and proceed with correct arguments, returning its result', async () => {
      const request = mockSimpleRequest({ method: 'post', path: '/some-path' })
      const context = mockContext({ payload: { foo: 'bar' } })
      const h = mockHapiResponseToolkit({ redirect: vi.fn() })

      const nextPath = '/test-form/declaration'

      controller.getNextPath = vi.fn().mockReturnValue(nextPath)
      const proceedResult = Symbol('proceed-result')
      controller.proceed = vi.fn().mockReturnValue(proceedResult)

      const result = await handler(request, context, h)

      expect(controller.getNextPath).toHaveBeenCalledTimes(1)
      expect(controller.getNextPath).toHaveBeenCalledWith(context)

      expect(controller.proceed).toHaveBeenCalledTimes(1)
      expect(controller.proceed).toHaveBeenCalledWith(request, h, nextPath)

      expect(result).toBe(proceedResult)
    })

    it('should preserve controller context inside returned handler', async () => {
      // If `this` is lost, spies won't be hit
      const request = mockSimpleRequest()
      const context = mockContext()
      const h = mockHapiResponseToolkit()

      controller.getNextPath = vi.fn().mockReturnValue('/next')
      controller.proceed = vi.fn().mockReturnValue('ok')

      const fn = controller.makePostRouteHandler()
      const ret = await fn(request, context, h)

      expect(controller.proceed).toHaveBeenCalledWith(request, h, '/next')
      expect(ret).toBe('ok')
    })
  })

  describe('integration with SummaryPageController', () => {
    it('should properly set up the controller instance', () => {
      expect(controller).toBeDefined()
      expect(controller.viewName).toBe('check-responses-page')
      expect(controller).toHaveProperty('makePostRouteHandler')
    })

    it('should override getSummaryViewModel from parent', () => {
      expect(controller.getSummaryViewModel).toBeDefined()
    })

    it('should override makePostRouteHandler from parent', () => {
      const handler = controller.makePostRouteHandler()
      expect(typeof handler).toBe('function')
      expect(handler.constructor.name).toBe('AsyncFunction')
    })
  })

  describe('view file existence', () => {
    it('should reference a view file that actually exists', () => {
      const viewPath = controller.viewName
      expect(viewPath).toBe('check-responses-page')

      // Check that the view file exists at the expected location
      const absoluteViewPath = join(process.cwd(), 'src/server/check-responses/views', `${viewPath}.html`)
      expect(existsSync(absoluteViewPath)).toBe(true)
    })

    it('should have view file in the feature-based location', () => {
      const featureViewPath = join(process.cwd(), 'src/server/check-responses/views/check-responses-page.html')
      expect(existsSync(featureViewPath)).toBe(true)
    })
  })
})
