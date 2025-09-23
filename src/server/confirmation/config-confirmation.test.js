import { vi } from 'vitest'
import { configConfirmation } from './config-confirmation.js'
import { ConfirmationService } from './services/confirmation.service.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

const mockFormsCacheService = {
  getConfirmationState: vi.fn()
}

const mockYarSession = {
  get: vi.fn()
}

vi.mock('./services/confirmation.service.js')
vi.mock('~/src/server/common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: () => mockFormsCacheService
}))

describe('config-confirmation', () => {
  let mockRequest
  let mockH
  let mockLogger
  let server

  const mockForm = {
    id: 'test-form-id',
    slug: 'test-slug',
    title: 'Test Form'
  }

  const mockConfirmationContent = {
    html: '<h2>Test confirmation content</h2>'
  }

  const mockSessionData = {
    referenceNumber: 'REF123',
    businessName: 'Test Business',
    sbi: '123456789',
    contactName: 'Test Contact'
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    }

    mockRequest = mockHapiRequest({
      params: { slug: 'test-slug' },
      logger: mockLogger,
      yar: mockYarSession,
      server: {}
    })

    mockH = mockHapiResponseToolkit()

    server = {
      route: vi.fn()
    }

    ConfirmationService.findFormBySlug = vi.fn()
    ConfirmationService.loadConfirmationContent = vi.fn()
    ConfirmationService.buildViewModel = vi.fn()

    // Default setup for most tests - can be overridden in individual tests
    mockFormsCacheService.getConfirmationState.mockResolvedValue({
      $$__referenceNumber: 'REF123'
    })
  })

  describe('plugin registration', () => {
    test('should register plugin with correct name', () => {
      expect(configConfirmation.plugin.name).toBe('config-confirmation')
    })

    test('should register route with correct configuration', () => {
      configConfirmation.plugin.register(server)

      expect(server.route).toHaveBeenCalledWith({
        method: 'GET',
        path: '/{slug}/confirmation',
        handler: expect.any(Function)
      })
    })
  })

  describe('route handler', () => {
    let handler

    beforeEach(() => {
      configConfirmation.plugin.register(server)
      handler = server.route.mock.calls[0][0].handler
    })

    test('should return 400 error when slug is missing', async () => {
      mockRequest.params = {}
      const mockBadRequestResponse = { code: vi.fn().mockReturnValue('bad-request-response') }
      mockH.response.mockReturnValue(mockBadRequestResponse)

      const result = await handler(mockRequest, mockH)

      expect(mockLogger.warn).toHaveBeenCalledWith('No slug provided in confirmation route')
      expect(mockH.response).toHaveBeenCalledWith('Bad request - missing slug')
      expect(mockBadRequestResponse.code).toHaveBeenCalledWith(400)
      expect(result).toBe('bad-request-response')
    })

    test('should return 404 error when form is not found', async () => {
      ConfirmationService.findFormBySlug.mockReturnValue(null)
      const mockNotFoundResponse = { code: vi.fn().mockReturnValue('not-found-response') }
      mockH.response.mockReturnValue(mockNotFoundResponse)

      const result = await handler(mockRequest, mockH)

      expect(ConfirmationService.findFormBySlug).toHaveBeenCalledWith('test-slug')
      expect(mockLogger.warn).toHaveBeenCalledWith('Form not found for slug', { slug: 'test-slug' })
      expect(mockH.response).toHaveBeenCalledWith('Form not found')
      expect(mockNotFoundResponse.code).toHaveBeenCalledWith(404)
      expect(result).toBe('not-found-response')
    })

    test('should return 501 error when form has no config-driven confirmation content', async () => {
      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue(null)
      const mockNotImplementedResponse = { code: vi.fn().mockReturnValue('not-implemented-response') }
      mockH.response.mockReturnValue(mockNotImplementedResponse)

      const result = await handler(mockRequest, mockH)

      expect(ConfirmationService.loadConfirmationContent).toHaveBeenCalledWith(mockForm, mockLogger)
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Form does not have config-driven confirmation content',
        { slug: 'test-slug', formId: 'test-form-id' }
      )
      expect(mockH.response).toHaveBeenCalledWith('Not config-driven - fallback to forms engine')
      expect(mockNotImplementedResponse.code).toHaveBeenCalledWith(501)
      expect(result).toBe('not-implemented-response')
    })

    test('should successfully render confirmation page with valid data', async () => {
      const mockViewModel = { test: 'viewModel' }
      const mockViewResponse = 'view-response'

      mockYarSession.get
        .mockReturnValueOnce('Test Business')
        .mockReturnValueOnce('123456789')
        .mockReturnValueOnce('Test Contact')

      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue(mockConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue(mockViewModel)
      mockH.view.mockReturnValue(mockViewResponse)

      const result = await handler(mockRequest, mockH)

      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        referenceNumber: 'REF123',
        businessName: 'Test Business',
        sbi: '123456789',
        contactName: 'Test Contact',
        confirmationContent: mockConfirmationContent
      })
      expect(mockH.view).toHaveBeenCalledWith('confirmation/views/config-confirmation-page', mockViewModel)
      expect(result).toBe('view-response')
    })

    test('should handle missing reference number gracefully', async () => {
      mockFormsCacheService.getConfirmationState.mockResolvedValue({})
      mockYarSession.get.mockReturnValue(undefined)

      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue(mockConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({})

      await handler(mockRequest, mockH)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No reference number found in confirmation state or session',
        {
          slug: 'test-slug',
          confirmationState: true,
          hasConfirmationReferenceNumber: false
        }
      )

      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        referenceNumber: 'Not available',
        businessName: undefined,
        sbi: undefined,
        contactName: undefined,
        confirmationContent: mockConfirmationContent
      })
    })

    describe('reference number retrieval priority', () => {
      const referenceNumberSources = [
        {
          name: 'confirmation state $$__referenceNumber',
          setup: () => {
            mockFormsCacheService.getConfirmationState.mockResolvedValue({
              $$__referenceNumber: 'CONF_REF123'
            })
            mockYarSession.get
              .mockReturnValueOnce('ALT_REF456')
              .mockReturnValueOnce('SESSION_REF789')
              .mockReturnValueOnce('Test Business')
              .mockReturnValueOnce('123456789')
              .mockReturnValueOnce('Test Contact')
          },
          expected: 'CONF_REF123'
        },
        {
          name: 'session referenceNumber',
          setup: () => {
            mockFormsCacheService.getConfirmationState.mockResolvedValue({})
            mockYarSession.get
              .mockReturnValueOnce('SESSION_REF456')  // 'referenceNumber'
              .mockReturnValueOnce('Test Business')   // 'businessName'
              .mockReturnValueOnce('123456789')       // 'sbi'
              .mockReturnValueOnce('Test Contact')    // 'contactName'
          },
          expected: 'SESSION_REF456'
        },
        {
          name: 'session $$__referenceNumber',
          setup: () => {
            mockFormsCacheService.getConfirmationState.mockResolvedValue({})
            mockYarSession.get
              .mockReturnValueOnce(undefined)          // 'referenceNumber'
              .mockReturnValueOnce('ALT_SESSION_REF789') // '$$__referenceNumber'
              .mockReturnValueOnce('Test Business')     // 'businessName'
              .mockReturnValueOnce('123456789')         // 'sbi'
              .mockReturnValueOnce('Test Contact')      // 'contactName'
          },
          expected: 'ALT_SESSION_REF789'
        }
      ]

      test.each(referenceNumberSources)(
        'should use $name as reference number source',
        async ({ setup, expected }) => {
          setup()

          ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
          ConfirmationService.loadConfirmationContent.mockResolvedValue(mockConfirmationContent)
          ConfirmationService.buildViewModel.mockReturnValue({})

          await handler(mockRequest, mockH)

          expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith(
            expect.objectContaining({
              referenceNumber: expected
            })
          )
        }
      )
    })

    test('should return 500 error when an exception occurs', async () => {
      const testError = new Error('Test error')
      ConfirmationService.findFormBySlug.mockImplementation(() => {
        throw testError
      })

      const mockServerErrorResponse = { code: vi.fn().mockReturnValue('server-error-response') }
      mockH.response.mockReturnValue(mockServerErrorResponse)

      const result = await handler(mockRequest, mockH)

      expect(mockLogger.error).toHaveBeenCalledWith('Config-driven confirmation route error', {
        error: 'Test error',
        stack: expect.any(String),
        slug: 'test-slug'
      })
      expect(mockH.response).toHaveBeenCalledWith('Server error')
      expect(mockServerErrorResponse.code).toHaveBeenCalledWith(500)
      expect(result).toBe('server-error-response')
    })

    test('should handle missing request params in error handler', async () => {
      mockRequest.params = undefined
      const mockServerErrorResponse = { code: vi.fn().mockReturnValue('server-error-response') }
      mockH.response.mockReturnValue(mockServerErrorResponse)

      const result = await handler(mockRequest, mockH)

      expect(mockLogger.error).toHaveBeenCalledWith('Config-driven confirmation route error', {
        error: expect.stringContaining('Cannot destructure property'),
        stack: expect.any(String),
        slug: undefined
      })
      expect(result).toBe('server-error-response')
    })
  })

  describe('session data handling', () => {
    let handler

    beforeEach(() => {
      configConfirmation.plugin.register(server)
      handler = server.route.mock.calls[0][0].handler

      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue(mockConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({})
    })

    test('should extract session data in correct order', async () => {
      // Since confirmationState has $$__referenceNumber: 'REF123' in beforeEach,
      // it won't call yar.get for reference numbers, only for business data
      mockYarSession.get
        .mockReturnValueOnce('Business Name')  // 'businessName'
        .mockReturnValueOnce('987654321')      // 'sbi'
        .mockReturnValueOnce('Contact Name')   // 'contactName'

      await handler(mockRequest, mockH)

      expect(mockYarSession.get).toHaveBeenNthCalledWith(1, 'businessName')
      expect(mockYarSession.get).toHaveBeenNthCalledWith(2, 'sbi')
      expect(mockYarSession.get).toHaveBeenNthCalledWith(3, 'contactName')
      expect(mockYarSession.get).toHaveBeenCalledTimes(3)

      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        referenceNumber: 'REF123',
        businessName: 'Business Name',
        sbi: '987654321',
        contactName: 'Contact Name',
        confirmationContent: mockConfirmationContent
      })
    })

    test('should handle missing yar session gracefully', async () => {
      mockRequest.yar = undefined

      await handler(mockRequest, mockH)

      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        referenceNumber: 'REF123',
        businessName: undefined,
        sbi: undefined,
        contactName: undefined,
        confirmationContent: mockConfirmationContent
      })
    })
  })
})