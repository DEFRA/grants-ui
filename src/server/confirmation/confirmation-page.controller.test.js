import { vi } from 'vitest'
import { StatusPageController } from '@defra/forms-engine-plugin/controllers/StatusPageController.js'
import ConfirmationPageController from './confirmation-page.controller.js'
import * as formSlugHelper from '~/src/server/common/helpers/form-slug-helper.js'
import { ConfirmationService } from './services/confirmation.service.js'
import Boom from '@hapi/boom'
import { log } from '../common/helpers/logging/log.js'

const mockFormsCacheServiceMethods = {
  getState: vi.fn()
}

vi.mock('@defra/forms-engine-plugin/controllers/StatusPageController.js')

vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => mockFormsCacheServiceMethods
}))

vi.mock('~/src/server/common/helpers/form-slug-helper.js')

vi.mock('../common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    CONFIRMATION: {
      CONFIRMATION_ERROR: 'CONFIRMATION_ERROR'
    }
  }
}))

describe('ConfirmationPageController', () => {
  let controller
  let mockRequest
  let mockContext
  let mockH

  beforeEach(() => {
    StatusPageController.prototype.getStartPath = vi.fn().mockReturnValue('/default-start')

    controller = new ConfirmationPageController()

    controller.model = {
      def: {
        title: 'Test Form',
        metadata: {
          slug: 'test-form'
        }
      }
    }

    mockRequest = {
      params: {
        slug: 'test-form'
      },
      server: {},
      yar: {
        get: vi.fn()
      }
    }

    mockContext = {}

    mockH = {
      view: vi.fn().mockReturnValue('rendered view'),
      response: vi.fn(() => ({
        code: vi.fn()
      }))
    }

    formSlugHelper.storeSlugInContext.mockImplementation(() => null)
    formSlugHelper.getConfirmationPath.mockReturnValue('/confirmation')

    mockFormsCacheServiceMethods.getState.mockResolvedValue({
      $$__referenceNumber: 'REF123'
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('makeGetRouteHandler', () => {
    test('stores slug in context', async () => {
      vi.spyOn(controller, 'loadConfirmationContent').mockResolvedValue(null)
      vi.spyOn(controller, 'buildAndRenderConfirmationResponse').mockReturnValue('rendered')

      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(formSlugHelper.storeSlugInContext).toHaveBeenCalledWith(mockRequest, mockContext, 'ConfirmationController')
    })

    test('loads state and renders confirmation page', async () => {
      vi.spyOn(controller, 'loadConfirmationContent').mockResolvedValue({
        html: '<p>test</p>'
      })

      const renderSpy = vi.spyOn(controller, 'buildAndRenderConfirmationResponse').mockReturnValue('rendered')

      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(renderSpy).toHaveBeenCalledWith(
        { html: '<p>test</p>' },
        expect.objectContaining({
          referenceNumber: 'REF123'
        }),
        controller.model.def,
        'test-form',
        mockH
      )
    })

    test('passes session data to renderer', async () => {
      mockRequest.yar.get.mockImplementation(
        (key) =>
          ({
            businessName: 'Business Ltd',
            sbi: '123456',
            contactName: 'John Doe'
          })[key]
      )

      vi.spyOn(controller, 'loadConfirmationContent').mockResolvedValue(null)

      const renderSpy = vi.spyOn(controller, 'buildAndRenderConfirmationResponse').mockReturnValue('rendered')

      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(renderSpy).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          businessName: 'Business Ltd',
          sbi: '123456',
          contactName: 'John Doe'
        }),
        expect.any(Object),
        expect.any(String),
        mockH
      )
    })

    test('uses fallback reference number when missing', async () => {
      mockFormsCacheServiceMethods.getState.mockResolvedValue({})

      vi.spyOn(controller, 'loadConfirmationContent').mockResolvedValue(null)

      const renderSpy = vi.spyOn(controller, 'buildAndRenderConfirmationResponse').mockReturnValue('rendered')

      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(renderSpy).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          referenceNumber: 'Not available'
        }),
        expect.any(Object),
        expect.any(String),
        mockH
      )
    })

    test('delegates unexpected errors to handleError', async () => {
      const error = new Error('boom')

      vi.spyOn(controller, 'loadConfirmationContent').mockRejectedValue(error)

      const handleErrorSpy = vi.spyOn(controller, 'handleError').mockReturnValue('error response')

      const handler = controller.makeGetRouteHandler()

      const result = await handler(mockRequest, mockContext, mockH)

      expect(handleErrorSpy).toHaveBeenCalledWith(error, mockRequest, mockH)
      expect(result).toBe('error response')
    })
  })

  describe('buildAndRenderConfirmationResponse', () => {
    test('buildAndRenderConfirmationResponse builds view model and renders view', () => {
      const viewModel = { foo: 'bar' }

      vi.spyOn(ConfirmationService, 'buildViewModel').mockReturnValue(viewModel)

      controller.buildAndRenderConfirmationResponse(
        { html: '<p>test</p>' },
        { referenceNumber: 'REF123' },
        controller.model.def,
        'test-form',
        mockH
      )

      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        referenceNumber: 'REF123',
        businessName: undefined,
        sbi: undefined,
        contactName: undefined,
        confirmationContent: { html: '<p>test</p>' },
        form: controller.model.def,
        slug: 'test-form'
      })

      expect(mockH.view).toHaveBeenCalledWith('confirmation-page', viewModel)
    })
  })

  describe('getStatusPath', () => {
    test('returns confirmation path', () => {
      expect(controller.getStatusPath(mockRequest, mockContext)).toBe('/confirmation')
    })
  })

  describe('getStartPath', () => {
    test('returns slug start path', () => {
      expect(controller.getStartPath()).toBe('/test-form/start')
    })

    test('falls back to parent path', () => {
      controller.model = {}

      expect(controller.getStartPath()).toBe('/default-start')
    })
  })

  describe('loadConfirmationContent', () => {
    test('loads confirmation content from service and processes it', async () => {
      const confirmationContent = {
        html: '<p>hello</p>'
      }

      vi.spyOn(ConfirmationService, 'loadConfirmationContent').mockResolvedValue({
        confirmationContent
      })

      vi.spyOn(ConfirmationService, 'processConfirmationContent').mockReturnValue({
        html: '<p>processed</p>'
      })

      const state = { foo: 'bar' }

      const result = await controller.loadConfirmationContent(mockRequest, state)

      expect(ConfirmationService.loadConfirmationContent).toHaveBeenCalledWith(controller.model.def)

      expect(ConfirmationService.processConfirmationContent).toHaveBeenCalledWith(
        confirmationContent,
        'test-form',
        state
      )

      expect(result).toEqual({
        html: '<p>processed</p>'
      })
    })

    test('returns null when no confirmation content exists', async () => {
      vi.spyOn(ConfirmationService, 'loadConfirmationContent').mockResolvedValue({
        confirmationContent: null
      })

      const processSpy = vi.spyOn(ConfirmationService, 'processConfirmationContent')

      const result = await controller.loadConfirmationContent(mockRequest, {})

      expect(processSpy).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })
  })

  describe('handleError', () => {
    test('rethrows boom errors', () => {
      const error = Boom.badRequest('bad request')

      expect(() => controller.handleError(error, mockRequest, mockH)).toThrow(error)
    })

    test('logs and returns 500 response for non-boom errors', () => {
      const codeMock = vi.fn()

      mockH.response.mockReturnValue({
        code: codeMock
      })

      const error = new Error('oops')

      controller.handleError(error, mockRequest, mockH)

      expect(log).toHaveBeenCalled()

      expect(mockH.response).toHaveBeenCalledWith('Server error')
      expect(codeMock).toHaveBeenCalledWith(500)
    })
  })
})
