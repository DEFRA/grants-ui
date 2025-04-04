import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { fetchLandSheetDetails } from '~/src/server/land-grants/services/land-grants.service.js'
import LandActionsController from './actions.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')
jest.mock('~/src/server/land-grants/services/land-grants.service.js')

describe('LandActionsController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  const availableActions = [
    {
      code: 'action1',
      description: 'Action 1 description',
      availableArea: {
        unit: 'ha',
        value: 200
      }
    }
  ]
  const actionsObj = { action1: { value: 10, unit: 'ha' } }

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Land Actions'
    })

    controller = new LandActionsController()
    controller.availableActions = availableActions
    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }
    controller.setState = jest.fn().mockResolvedValue(true)
    controller.proceed = jest.fn().mockReturnValue('redirected')
    controller.getNextPath = jest.fn().mockReturnValue('/next-path')

    mockRequest = {
      payload: {
        'area-action1': 10,
        applicationValue: '£16,467.49',
        actions: ['action1', 'action2']
      },
      logger: {
        error: jest.fn()
      }
    }

    mockContext = {
      state: {
        landParcel: 'sheet1-parcel1'
      }
    }

    mockH = {
      view: jest.fn().mockReturnValue('rendered view')
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('should have the correct viewName', () => {
    expect(controller.viewName).toBe('actions')
  })

  describe('GET route handler', () => {
    test('should fetch land details and render view with correct data', async () => {
      fetchLandSheetDetails.mockResolvedValue({
        parcel: {
          actions: ['action1', 'action2', 'action3']
        }
      })

      mockContext.state.actions = ['action1', 'action2']

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchLandSheetDetails).toHaveBeenCalledWith('parcel1', 'sheet1')
      expect(mockH.view).toHaveBeenCalledWith(
        'actions',
        expect.objectContaining({
          landParcel: 'sheet1-parcel1',
          availableActions: ['action1', 'action2', 'action3'],
          actions: ['action1', 'action2']
        })
      )
      expect(result).toBe('rendered view')
    })

    test('should handle fetch errors gracefully', async () => {
      fetchLandSheetDetails.mockRejectedValue(new Error('API error'))

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'actions',
        expect.objectContaining({
          availableActions
        })
      )
    })

    test('should log error when no actions found', async () => {
      fetchLandSheetDetails.mockResolvedValue({
        parcel: {
          actions: []
        }
      })

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockRequest.logger.error).toHaveBeenCalledWith({
        landParcel: 'sheet1-parcel1',
        message: 'No actions found for parcel sheet1-parcel1'
      })
    })

    test('should default sheetId and parcelId when landParcel is missing', async () => {
      mockContext.state = {}
      controller.collection.getErrors.mockReturnValue([])

      fetchLandSheetDetails.mockResolvedValue({ parcel: { actions: [] } })

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchLandSheetDetails).toHaveBeenCalledWith(undefined, '')
      expect(mockH.view).toHaveBeenCalledWith(
        'actions',
        expect.objectContaining({
          availableActions: []
        })
      )
      expect(result).toBe('rendered view')
    })

    test('should default to empty actions when parcel.actions is undefined', async () => {
      fetchLandSheetDetails.mockResolvedValue({
        parcel: {}
      })

      controller.collection.getErrors.mockReturnValue([])

      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'actions',
        expect.objectContaining({
          availableActions: [],
          landParcel: 'sheet1-parcel1'
        })
      )
      expect(result).toBe('rendered view')
    })
  })

  describe('POST route handler', () => {
    test('should update state with form values and proceed', async () => {
      const handler = controller.makePostRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        landParcel: 'sheet1-parcel1',
        actions: ['action1', 'action2'],
        area: JSON.stringify(actionsObj),
        actionsObj,
        applicationValue: '£16,467.49'
      })

      expect(controller.proceed).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        '/next-path'
      )

      expect(result).toBe('redirected')
    })

    test('should handle empty payload gracefully', async () => {
      mockRequest.payload = null

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.setState).toHaveBeenCalledWith(mockRequest, {
        landParcel: 'sheet1-parcel1',
        actions: '',
        area: JSON.stringify({}),
        actionsObj: {},
        applicationValue: '£16,467.49'
      })
    })
  })
})

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
