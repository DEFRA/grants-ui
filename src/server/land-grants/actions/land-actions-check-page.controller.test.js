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
          CMOR1: {
            description: 'Crop Management',
            value: 10,
            unit: 'm'
          }
        }
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
    expect(controller.viewName).toBe('land-actions-check')
  })

  describe('GET route handler', () => {
    test('should render view', async () => {
      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(result).toBe('rendered view')
    })

    describe('selectedActionRows', () => {
      test('should build selected action rows correctly', async () => {
        const handler = controller.makeGetRouteHandler()
        await handler(mockRequest, mockContext, mockH)

        expect(mockH.view).toHaveBeenCalledWith(
          'land-actions-check',
          expect.objectContaining({
            actionsObj: {
              CMOR1: { description: 'Crop Management', unit: 'm', value: 10 }
            },
            errors: [],
            landParcel: 'sheet1-parcel1',
            pageTitle: 'Check selected land actions',
            selectedActionRows: [
              [
                { text: 'sheet1-parcel1' },
                { text: 'Crop Management' },
                { text: '10 m' }
              ]
            ]
          })
        )
      })
    })
  })

  describe('POST route handler', () => {
    test('should proceed to next page', async () => {
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
