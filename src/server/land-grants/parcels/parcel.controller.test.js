import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { fetchParcelDataForBusiness } from '~/src/server/common/services/consolidated-view.service.js'
import LandParcelController from './parcel.controller.js'

jest.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js')

jest.mock('~/src/server/common/services/consolidated-view.service.js', () => ({
  fetchParcelDataForBusiness: jest.fn()
}))

describe('LandParcelController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    QuestionPageController.prototype.getViewModel = jest.fn().mockReturnValue({
      pageTitle: 'Select Land Parcel'
    })

    controller = new LandParcelController()
    controller.collection = {
      getErrors: jest.fn().mockReturnValue([])
    }

    fetchParcelDataForBusiness.mockResolvedValue({
      data: {
        name: 'Test Farm',
        address: '123 Farm Road',
        parcels: [
          { id: 'parcel1', name: 'Field 1', area: 10 },
          { id: 'parcel2', name: 'Field 2', area: 20 }
        ]
      }
    })

    mockRequest = {
      query: {},
      logger: {
        error: jest.fn()
      }
    }

    mockContext = {
      state: {
        sbi: 117235001,
        customerReference: 1100598138
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

  it('should have the correct viewName', () => {
    expect(controller.viewName).toBe('parcel')
  })

  describe('GET route handler', () => {
    it('should fetch business info and render view with correct data', async () => {
      const handler = controller.makeGetRouteHandler()
      const result = await handler(mockRequest, mockContext, mockH)

      expect(fetchParcelDataForBusiness).toHaveBeenCalledWith(
        117235001,
        1100598138
      )

      expect(mockH.view).toHaveBeenCalledWith(
        'parcel',
        expect.objectContaining({
          pageTitle: 'Select Land Parcel'
        })
      )

      expect(result).toBe('rendered view')
    })

    it('should handle missing business info gracefully', async () => {
      fetchParcelDataForBusiness.mockRejectedValue(new Error('not found'))

      const handler = controller.makeGetRouteHandler()

      await expect(handler(mockRequest, mockContext, mockH)).rejects.toThrow(
        'No business information found for sbi 117235001'
      )

      await expect(
        handler(mockRequest, mockContext, mockH)
      ).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 404
        }
      })

      expect(fetchParcelDataForBusiness).toHaveBeenCalledWith(
        117235001,
        1100598138
      )
    })
  })
})

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
