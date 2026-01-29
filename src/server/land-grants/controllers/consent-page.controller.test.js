import { vi } from 'vitest'
import ConsentPageController from './consent-page.controller.js'
import LandGrantsQuestionWithAuthCheckController from './auth/land-grants-question-with-auth-check.controller.js'

describe('ConsentPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    LandGrantsQuestionWithAuthCheckController.prototype.getViewModel = vi.fn().mockReturnValue({
      pageTitle: 'You must have consent'
    })

    controller = new ConsentPageController()
    controller.setState = vi.fn().mockResolvedValue(true)
    controller.proceed = vi.fn().mockReturnValue('redirected')

    mockRequest = {
      payload: {}
    }
    mockContext = {
      state: {}
    }
    mockH = {
      view: vi.fn().mockReturnValue('rendered view'),
      redirect: vi.fn().mockReturnValue('redirected')
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('GET Handler', () => {
    test('should display consent page when requiredConsents exist', async () => {
      mockContext.state = {
        requiredConsents: ['sssi']
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'consent-required',
        expect.objectContaining({
          requiredConsents: ['sssi']
        })
      )
    })

    test('should display consent page with multiple consent types', async () => {
      mockContext.state = {
        requiredConsents: ['sssi', 'hefer']
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'consent-required',
        expect.objectContaining({
          requiredConsents: ['sssi', 'hefer']
        })
      )
    })

    test('should redirect to check-selected-land-actions when no consents required', async () => {
      mockContext.state = {
        requiredConsents: []
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(mockH.view).not.toHaveBeenCalled()
    })

    test('should redirect when requiredConsents is undefined', async () => {
      mockContext.state = {}

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(mockH.view).not.toHaveBeenCalled()
    })

    test('should redirect when requiredConsents is null', async () => {
      mockContext.state = {
        requiredConsents: null
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/check-selected-land-actions')
      expect(mockH.view).not.toHaveBeenCalled()
    })
  })

  describe('POST Handler', () => {
    test('should proceed to submit application', async () => {
      mockContext.state = {
        requiredConsents: ['sssi'],
        otherData: 'preserved'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
    })

    test('should proceed to submit application when no requiredConsents in state', async () => {
      mockContext.state = {
        otherData: 'preserved'
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
    })

    test('should handle empty state gracefully', async () => {
      mockContext.state = {}

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
    })

    test('should handle state with multiple consent types', async () => {
      mockContext.state = {
        requiredConsents: ['sssi', 'hefer'],
        landParcels: { 'AB1234-5678': {} },
        payment: { total: 100 }
      }

      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
    })
  })
})
