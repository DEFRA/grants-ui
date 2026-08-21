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

    controller.pageDef = { path: '/confirmation' }

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
        mockH,
        expect.any(Array)
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
        mockH,
        expect.any(Array)
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
        mockH,
        expect.any(Array)
      )
    })

    test('uses the state reference number as the panel value for an application confirmation', async () => {
      mockFormsCacheServiceMethods.getState.mockResolvedValue({
        $$__referenceNumber: 'WMP-123'
      })

      vi.spyOn(controller, 'loadConfirmationContent').mockResolvedValue(null)

      const renderSpy = vi.spyOn(controller, 'buildAndRenderConfirmationResponse').mockReturnValue('rendered')

      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(renderSpy).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          referenceNumber: 'WMP-123'
        }),
        expect.any(Object),
        expect.any(String),
        mockH,
        expect.any(Array)
      )
    })

    test('uses the latest claim number as the panel value for a claim confirmation', async () => {
      controller.pageDef = { path: '/claim-confirmation' }
      controller.model.def.metadata.pageConfig = {
        '/claim-confirmation': { confirmationType: 'claim' }
      }

      mockFormsCacheServiceMethods.getState.mockResolvedValue({
        $$__referenceNumber: 'WMP-A1B2-C3D4',
        claims: [
          { claimNumber: 'WMP-A1B2-C3D4-C01', status: 'SUBMITTED' },
          { claimNumber: 'WMP-A1B2-C3D4-C02', status: 'SUBMITTED' }
        ]
      })

      vi.spyOn(controller, 'loadConfirmationContent').mockResolvedValue(null)

      const renderSpy = vi.spyOn(controller, 'buildAndRenderConfirmationResponse').mockReturnValue('rendered')

      const handler = controller.makeGetRouteHandler()

      await handler(mockRequest, mockContext, mockH)

      expect(renderSpy).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          referenceNumber: 'WMP-A1B2-C3D4-C02'
        }),
        expect.any(Object),
        expect.any(String),
        mockH,
        expect.any(Array)
      )
    })

    test('renders Html components with state data (reference number and slug)', () => {
      const components = [
        {
          type: 'Html',
          model: {
            content: 'Reference {{ referenceNumber }} for /{{ slug }}/print-submitted-application'
          }
        }
      ]

      const state = { $$__referenceNumber: 'WMP-123' }

      const rendered = controller.renderComponents(components, state, 'test-form')

      expect(rendered[0].model.content).toBe('Reference WMP-123 for /test-form/print-submitted-application')
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

  describe('confirmationType', () => {
    test('defaults to application when no config is set', () => {
      expect(controller.confirmationType).toBe('application')
    })

    test('reads the configured confirmation type for this page', () => {
      controller.pageDef = { path: '/claim-confirmation' }
      controller.model.def.metadata.pageConfig = {
        '/claim-confirmation': { confirmationType: 'claim' }
      }

      expect(controller.confirmationType).toBe('claim')
    })
  })

  describe('resolvePanelReference', () => {
    test('returns the application reference number for an application confirmation', () => {
      expect(controller.resolvePanelReference({ $$__referenceNumber: 'WMP-A1B2-C3D4' })).toBe('WMP-A1B2-C3D4')
    })

    test('returns the latest claim number for a claim confirmation', () => {
      controller.pageDef = { path: '/claim-confirmation' }
      controller.model.def.metadata.pageConfig = {
        '/claim-confirmation': { confirmationType: 'claim' }
      }

      const state = {
        $$__referenceNumber: 'WMP-A1B2-C3D4',
        claims: [
          { claimNumber: 'WMP-A1B2-C3D4-C01', status: 'SUBMITTED' },
          { claimNumber: 'WMP-A1B2-C3D4-C02', status: 'SUBMITTED' }
        ]
      }

      expect(controller.resolvePanelReference(state)).toBe('WMP-A1B2-C3D4-C02')
    })

    test('falls back to Not available when a claim confirmation has no claim', () => {
      controller.pageDef = { path: '/claim-confirmation' }
      controller.model.def.metadata.pageConfig = {
        '/claim-confirmation': { confirmationType: 'claim' }
      }

      expect(controller.resolvePanelReference({ $$__referenceNumber: 'WMP-A1B2-C3D4' })).toBe('Not available')
    })

    test('falls back to Not available when the application reference is missing', () => {
      expect(controller.resolvePanelReference({})).toBe('Not available')
    })
  })

  describe('getStatusPath', () => {
    test('returns the page path for the application confirmation page', () => {
      expect(controller.getStatusPath()).toBe('/confirmation')
    })

    test('returns the page path for the claim confirmation page', () => {
      controller.pageDef = { path: '/claim-confirmation' }

      expect(controller.getStatusPath()).toBe('/claim-confirmation')
    })

    test('falls back to the default confirmation path when pageDef is missing', () => {
      controller.pageDef = undefined

      expect(controller.getStatusPath()).toBe('/confirmation')
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

      const state = { foo: 'bar', $$__referenceNumber: 'WMP-123' }

      const result = await controller.loadConfirmationContent(mockRequest, state)

      expect(ConfirmationService.loadConfirmationContent).toHaveBeenCalledWith(controller.model.def, '/confirmation')

      expect(ConfirmationService.processConfirmationContent).toHaveBeenCalledWith(confirmationContent, 'test-form', {
        ...state,
        referenceNumber: 'WMP-123',
        slug: 'test-form',
        cdpEnvironment: 'local'
      })

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

  describe('renderComponents', () => {
    test('renders {{SLUG}} and {{cdpEnvironment}} tokens in Html component content', () => {
      const components = [
        {
          type: 'Html',
          model: {
            content:
              '<a href="https://fcp-sfd-frontend.{{cdpEnvironment or \'local\'}}.cdp-int.defra.cloud/">Back</a>' +
              '<a href="/{{SLUG}}/print-submitted-application">Print</a>'
          }
        }
      ]

      const [rendered] = controller.renderComponents(components, { $$__referenceNumber: 'REF123' }, 'test-form')

      expect(rendered.model.content).toContain('https://fcp-sfd-frontend.local.cdp-int.defra.cloud/')
      expect(rendered.model.content).toContain('/test-form/print-submitted-application')
    })

    test('leaves non-Html components untouched', () => {
      const components = [{ type: 'Details', model: { content: '{{cdpEnvironment}}' } }]

      const [rendered] = controller.renderComponents(components, {}, 'test-form')

      expect(rendered.model.content).toBe('{{cdpEnvironment}}')
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
