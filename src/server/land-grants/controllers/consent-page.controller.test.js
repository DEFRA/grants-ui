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
    controller.getNextPath = vi.fn().mockReturnValue('/submit-your-application')

    mockRequest = { payload: {} }
    mockContext = { state: {} }
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
        landParcels: {
          'AB1234-5678': { actionsObj: { ACTION1: { consents: ['sssi'] }, ACTION2: { consents: ['sssi'] } } }
        }
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'consent-required',
        expect.objectContaining({
          actionCount: 2,
          consentPanel: expect.objectContaining({ consentType: 'sssi' })
        })
      )
    })

    test('should display consent page with HEFER panel when only HEFER consent required', async () => {
      mockContext.state = {
        landParcels: {
          'AB1234-5678': { actionsObj: { ACTION1: { consents: ['hefer'] } } }
        }
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'consent-required',
        expect.objectContaining({
          actionCount: 1,
          consentPanel: expect.objectContaining({ consentType: 'hefer' })
        })
      )
    })

    test('should display consent page with combined panel when all consent types required', async () => {
      mockContext.state = {
        landParcels: {
          'AB1234-5678': { actionsObj: { ACTION1: { consents: ['sssi'] }, ACTION2: { consents: ['sssi'] } } },
          'CD5678-9012': { actionsObj: { ACTION3: { consents: ['hefer'] } } }
        }
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'consent-required',
        expect.objectContaining({
          actionCount: 3,
          consentPanel: expect.objectContaining({ consentType: 'all' })
        })
      )
    })

    test('should redirect via getNextPath when no landParcels in state', async () => {
      mockContext.state = {}

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
      expect(mockH.view).not.toHaveBeenCalled()
    })

    test('should handle parcels with missing actionsObj', async () => {
      mockContext.state = {
        landParcels: {
          'AB1234-5678': {},
          'CD5678-9012': { actionsObj: { ACTION1: { consents: ['hefer'] } } }
        }
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(mockH.view).toHaveBeenCalledWith(
        'consent-required',
        expect.objectContaining({
          actionCount: 1,
          consentPanel: expect.objectContaining({ consentType: 'hefer' })
        })
      )
    })

    test('should redirect to nextPath when no consents required', async () => {
      mockContext.state = {
        landParcels: {
          'AB1234-5678': { actionsObj: { ACTION1: { consents: [] } } }
        }
      }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
      expect(mockH.view).not.toHaveBeenCalled()
    })

    test('should redirect via getNextPath when landParcels is empty', async () => {
      mockContext.state = { landParcels: {} }

      const handler = controller.makeGetRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
      expect(mockH.view).not.toHaveBeenCalled()
    })
  })

  describe('POST Handler', () => {
    test('should proceed to next path via getNextPath', async () => {
      const handler = controller.makePostRouteHandler()
      await handler(mockRequest, mockContext, mockH)

      expect(controller.proceed).toHaveBeenCalledWith(mockRequest, mockH, '/submit-your-application')
    })
  })
})
