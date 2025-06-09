import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import LandActionsCheckPageController from './land-actions-check-page.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')
jest.mock('~/src/server/land-grants/actions/land-actions.service.js')

describe('LandActionsCheckPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Check selected land actions'
    })

    controller = new LandActionsCheckPageController()

    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }
    controller.setState = jest.fn().mockResolvedValue(true)
    controller.proceed = jest.fn().mockReturnValue('redirected')
    controller.getNextPath = jest.fn().mockReturnValue('/next-path')
    controller.getSelectedActionRows = jest
      .fn()
      .mockReturnValue([
        [
          { text: 'sheet1-parcel1' },
          { text: 'Test Action' },
          { text: '10 hectares' }
        ]
      ])

    mockRequest = {
      payload: {
        'qty-action1': 10,
        actions: ['action1', 'action2']
      },
      logger: {
        error: jest.fn()
      }
    }

    mockContext = {
      state: {
        landParcel: 'sheet1-parcel1',
        actionsObj: {
          action1: {
            description: 'Test Action',
            value: 10,
            unit: 'hectares'
          }
        }
      }
    }

    mockH = {
      view: jest.fn().mockReturnValue('rendered view'),
      redirect: jest.fn().mockReturnValue('redirected')
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('land-actions-check')
  })

  describe('GET route handler', () => {
    test('should render view', async () => {
      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(result).toBe('rendered view')
    })

    describe('selectedActionRows', () => {
      test('should build selected action rows correctly', () => {
        const result = controller.getSelectedActionRows(mockContext.state)

        expect(result).toEqual([
          [
            { text: 'sheet1-parcel1' },
            { text: 'Test Action' },
            { text: '10 hectares' }
          ]
        ])
      })
    })
  })

  describe('POST route handler', () => {
    test('should show error when addMoreActions is not provided and action is validate', async () => {
      mockRequest.payload = { action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        actionsObj: {
          action1: {
            description: 'Test Action',
            value: 10,
            unit: 'hectares'
          }
        },
        selectedActionRows: [],
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should show error when addMoreActions is null and action is validate', async () => {
      mockRequest.payload = { addMoreActions: null, action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        actionsObj: {
          action1: {
            description: 'Test Action',
            value: 10,
            unit: 'hectares'
          }
        },
        selectedActionRows: [],
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should show error when addMoreActions is undefined and action is validate', async () => {
      mockRequest.payload = { addMoreActions: undefined, action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        actionsObj: {
          action1: {
            description: 'Test Action',
            value: 10,
            unit: 'hectares'
          }
        },
        selectedActionRows: [],
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should redirect to select-land-parcel when addMoreActions is "true"', async () => {
      mockRequest.payload = { addMoreActions: 'true' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/select-land-parcel'
      )
      expect(result).toBe('redirected')
    })

    test('should proceed to next path when addMoreActions is "false"', async () => {
      mockRequest.payload = { addMoreActions: 'false' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/next-path'
      )
      expect(result).toBe('redirected')
    })

    test('should proceed to next path when addMoreActions is "no"', async () => {
      mockRequest.payload = { addMoreActions: 'no' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/next-path'
      )
      expect(result).toBe('redirected')
    })

    test('should handle empty payload gracefully when action is validate', async () => {
      mockRequest.payload = { action: 'validate' }

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith('land-actions-check', {
        pageTitle: 'Check selected land actions',
        landParcel: 'sheet1-parcel1',
        actionsObj: {
          action1: {
            description: 'Test Action',
            value: 10,
            unit: 'hectares'
          }
        },
        selectedActionRows: [],
        errorMessage: 'Please select if you want to add more actions'
      })
      expect(result).toBe('rendered view')
    })

    test('should proceed to next path without validation when action is not validate', async () => {
      mockRequest.payload = {}

      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/next-path'
      )
      expect(result).toBe('redirected')
    })
  })
})

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
