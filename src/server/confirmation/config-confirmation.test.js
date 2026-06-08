import { vi } from 'vitest'
import { configConfirmation } from './config-confirmation.js'
import { ConfirmationService } from './services/confirmation.service.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import { MOCK_CONFIRMATION_CONTENT, MOCK_FORMS } from './__test-fixtures__/confirmation-test-fixtures.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { enforcePagePermission } from '../common/request-pipeline/permissions/enforce-page-permission.js'
import { forbidden } from '@hapi/boom'

const mockFormsCacheService = {
  getState: vi.fn()
}

const mockYarSession = {
  get: vi.fn()
}

vi.mock('./services/confirmation.service.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => mockFormsCacheService
}))
vi.mock('../common/request-pipeline/permissions/enforce-page-permission.js', () => ({
  enforcePagePermission: vi.fn()
}))
describe('config-confirmation', () => {
  let mockRequest
  let mockH
  let mockLogger
  let handler

  const mockForm = MOCK_FORMS.basic
  const mockConfirmationContent = MOCK_CONFIRMATION_CONTENT.basic

  beforeEach(async () => {
    vi.clearAllMocks()

    mockLogger = mockRequestLogger()
    mockRequest = mockHapiRequest({
      path: '/test-slug/confirmation',
      params: { slug: 'test-slug' },
      pre: { validatedSlugAndForm: { slug: 'test-slug', form: mockForm } },
      logger: mockLogger,
      yar: mockYarSession
    })
    mockH = mockHapiResponseToolkit()

    ConfirmationService.loadConfirmationContent = vi.fn()
    ConfirmationService.processConfirmationContent = vi.fn()
    ConfirmationService.buildViewModel = vi.fn()
    ConfirmationService.hasConfigDrivenConfirmation = vi.fn().mockResolvedValue(true)

    const server = { route: vi.fn() }
    configConfirmation.plugin.register(server)
    handler = server.route.mock.calls[0][0].handler

    mockFormsCacheService.getState.mockResolvedValue({
      $$__referenceNumber: 'REF123'
    })

    vi.mocked(log).mockClear()
    vi.mocked(enforcePagePermission).mockReturnValue(mockH.continue)
  })

  describe('confirmation flow', () => {
    function setupHappyPathMocks({ confirmationContent = mockConfirmationContent } = {}) {
      const formDefinition = confirmationContent ? { metadata: { confirmationContent } } : { metadata: {} }
      mockYarSession.get
        .mockReturnValueOnce('Test Business')
        .mockReturnValueOnce('123456789')
        .mockReturnValueOnce('Test Contact')
      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent,
        formDefinition
      })
      return { confirmationContent, formDefinition }
    }

    test('should render confirmation page with valid form and data', async () => {
      const processedConfirmationContent = { html: '<h2>Processed content</h2>' }
      setupHappyPathMocks()
      ConfirmationService.processConfirmationContent.mockReturnValue(processedConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({ test: 'viewModel' })

      await handler(mockRequest, mockH)

      expect(ConfirmationService.loadConfirmationContent).toHaveBeenCalledWith(mockForm)
      expect(ConfirmationService.processConfirmationContent).toHaveBeenCalledWith(
        mockConfirmationContent,
        'test-slug',
        {
          $$__referenceNumber: 'REF123'
        }
      )
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        referenceNumber: 'REF123',
        businessName: 'Test Business',
        sbi: '123456789',
        contactName: 'Test Contact',
        confirmationContent: processedConfirmationContent,
        form: mockForm,
        slug: 'test-slug'
      })
      expect(mockH.view).toHaveBeenCalledWith('config-confirmation-page', { test: 'viewModel' })
      expect(enforcePagePermission).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        expect.objectContaining({
          referenceNumber: 'REF123'
        })
      )
    })

    test('should return validation error from handler when pre-handler returns an error', async () => {
      const preHandlerError = mockH.response('Bad request - missing slug').code(statusCodes.badRequest).takeover()
      mockRequest = mockHapiRequest({
        params: {},
        pre: {
          validatedSlugAndForm: { error: preHandlerError }
        }
      })

      const result = await handler(mockRequest, mockH)

      expect(result).toEqual(preHandlerError)
    })

    test('should render page with default content when no config-driven content available', async () => {
      setupHappyPathMocks({ confirmationContent: null })
      ConfirmationService.buildViewModel.mockReturnValue({ test: 'viewModel' })

      await handler(mockRequest, mockH)

      expect(ConfirmationService.processConfirmationContent).not.toHaveBeenCalled()
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        referenceNumber: 'REF123',
        businessName: 'Test Business',
        sbi: '123456789',
        contactName: 'Test Contact',
        confirmationContent: null,
        form: mockForm,
        slug: 'test-slug'
      })
      expect(mockH.view).toHaveBeenCalledWith('config-confirmation-page', { test: 'viewModel' })
      expect(enforcePagePermission).toHaveBeenCalledWith(
        mockRequest,
        mockH,
        expect.objectContaining({
          referenceNumber: 'REF123'
        })
      )
    })

    test('should handle missing reference number', async () => {
      const processedConfirmationContent = { html: '<h2>Processed content</h2>' }
      const mockFormDefinition = { metadata: { confirmationContent: mockConfirmationContent } }

      mockFormsCacheService.getState.mockResolvedValue({})
      mockYarSession.get.mockReturnValue(undefined)

      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent: mockConfirmationContent,
        formDefinition: mockFormDefinition
      })
      ConfirmationService.processConfirmationContent.mockReturnValue(processedConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({})

      await handler(mockRequest, mockH)

      expect(ConfirmationService.processConfirmationContent).toHaveBeenCalledWith(
        mockConfirmationContent,
        'test-slug',
        {}
      )
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith(
        expect.objectContaining({ referenceNumber: 'Not available' })
      )
    })

    test('should log when application status is SUBMITTED', async () => {
      mockFormsCacheService.getState.mockResolvedValue({
        $$__referenceNumber: 'REF123',
        applicationStatus: 'SUBMITTED'
      })

      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent: null,
        formDefinition: { metadata: {} }
      })
      ConfirmationService.buildViewModel.mockReturnValue({})

      await handler(mockRequest, mockH)

      expect(vi.mocked(log)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ controller: 'ConfirmationController', referenceNumber: 'REF123' }),
        mockRequest
      )
    })

    test('should handle errors gracefully', async () => {
      ConfirmationService.loadConfirmationContent.mockRejectedValue(new Error('Service error'))

      await handler(mockRequest, mockH)

      expect(vi.mocked(log)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          errorMessage: expect.stringContaining('Service error')
        }),
        mockRequest
      )
      expect(mockH.code).toHaveBeenCalledWith(500)
    })

    test('sets request.params.path before enforcing permissions', async () => {
      setupHappyPathMocks()

      mockRequest.path = '/test-slug/confirmation'

      await handler(mockRequest, mockH)

      expect(mockRequest.params.path).toBe('confirmation')
      expect(enforcePagePermission).toHaveBeenCalled()
    })

    test('returns permission redirect when permission check does not continue', async () => {
      const redirectResponse = { takeover: true }

      vi.mocked(enforcePagePermission).mockReturnValue(redirectResponse)

      const result = await handler(mockRequest, mockH)

      expect(result).toBe(redirectResponse)

      expect(ConfirmationService.loadConfirmationContent).not.toHaveBeenCalled()
    })

    test('rethrows boom errors from permission enforcement', async () => {
      const boomError = forbidden('Insufficient permissions')

      vi.mocked(enforcePagePermission).mockImplementation(() => {
        throw boomError
      })

      await expect(handler(mockRequest, mockH)).rejects.toThrow('Insufficient permissions')
    })

    test('does not continue processing when permission check returns redirect response', async () => {
      const redirectResponse = { takeover: true }

      vi.mocked(enforcePagePermission).mockReturnValue(redirectResponse)

      const result = await handler(mockRequest, mockH)

      expect(result).toBe(redirectResponse)

      expect(ConfirmationService.loadConfirmationContent).not.toHaveBeenCalled()
      expect(ConfirmationService.processConfirmationContent).not.toHaveBeenCalled()
      expect(ConfirmationService.buildViewModel).not.toHaveBeenCalled()
    })
  })
})
