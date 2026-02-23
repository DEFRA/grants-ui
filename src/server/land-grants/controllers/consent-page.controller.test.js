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
    test('should display consent page with SSSI panel when only SSSI consent required', async () => {
      mockContext.state = {
        requiredConsents: ['sssi']
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'consent-required',
        expect.objectContaining({
          consentPanel: expect.objectContaining({
            titleText: 'You must have SSSI consent',
            html: expect.stringContaining('SSSI')
          })
        })
      )
    })

    test('should display consent page with HEFER panel when only HEFER consent required', async () => {
      mockContext.state = {
        requiredConsents: ['hefer']
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'consent-required',
        expect.objectContaining({
          consentPanel: expect.objectContaining({
            titleText: 'You must get an SFI Historic Environment Farm Environment Record (SFI HEFER) from Historic England',
            html: expect.stringContaining('HEFER')
          })
        })
      )
    })

    test('should display consent page with combined panel when both consent types required', async () => {
      mockContext.state = {
        requiredConsents: ['sssi', 'hefer']
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'consent-required',
        expect.objectContaining({
          consentPanel: expect.objectContaining({
            titleText: 'You must get consent to do your actions',
            html: expect.stringContaining('SSSI')
          })
        })
      )
      const viewArgs = mockH.view.mock.calls[0][1]
      expect(viewArgs.consentPanel.html).toContain('HEFER')
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
