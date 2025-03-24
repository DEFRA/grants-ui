import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import LandParcelController from './controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')

describe('LandParcelController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH
  let mockCollection
  let getViewModelMock

  beforeEach(() => {
    getViewModelMock = jest.fn().mockReturnValue({
      pageTitle: 'Select Land Parcel'
    })

    QuestionPageController.prototype.getViewModel = getViewModelMock

    mockCollection = {
      getErrors: jest.fn().mockReturnValue([])
    }

    mockRequest = {}
    mockContext = {}
    mockH = {
      view: jest.fn().mockReturnValue('rendered view')
    }

    controller = new LandParcelController()
    controller.collection = mockCollection
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('select-land-parcel')
  })

  describe('GET route handler', () => {
    test('should return a function from makeGetRouteHandler', () => {
      expect(typeof controller.makeGetRouteHandler).toBe('function')
      expect(typeof controller.makeGetRouteHandler()).toBe('function')
    })

    test('should call super.getViewModel with request and context', () => {
      const handler = controller.makeGetRouteHandler()
      handler(mockRequest, mockContext, mockH)

      expect(getViewModelMock).toHaveBeenCalledWith(mockRequest, mockContext)
    })

    test('should get errors from collection', () => {
      const handler = controller.makeGetRouteHandler()
      handler(mockRequest, mockContext, mockH)

      expect(mockCollection.getErrors).toHaveBeenCalled()
    })

    test('should render view with correct view model', () => {
      const handler = controller.makeGetRouteHandler()
      handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('select-land-parcel', {
        pageTitle: 'Select Land Parcel',
        errors: []
      })
    })

    test('should return the result of h.view', () => {
      const handler = controller.makeGetRouteHandler()
      const result = handler(mockRequest, mockContext, mockH)

      expect(result).toBe('rendered view')
    })
  })
})

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
