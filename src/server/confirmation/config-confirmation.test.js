import { vi } from 'vitest'
import { configConfirmation } from './config-confirmation.js'
import { ConfirmationService } from './services/confirmation.service.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import {
  MOCK_FORMS,
  MOCK_CONFIRMATION_CONTENT,
  createMockLogger
} from './__test-fixtures__/confirmation-test-fixtures.js'
import { log } from '~/src/server/common/helpers/logging/log.js'

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
vi.mock('~/src/server/common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => [MOCK_FORMS.basic])
}))
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    CONFIRMATION: {
      CONFIRMATION_ERROR: { level: 'error', messageFunc: vi.fn() },
      CONFIRMATION_SUCCESS: { level: 'info', messageFunc: vi.fn() },
      CONFIRMATION_LOAD: { level: 'info', messageFunc: vi.fn() }
    }
  }
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

    mockLogger = createMockLogger()
    mockRequest = mockHapiRequest({
      params: { slug: 'test-slug' },
      logger: mockLogger,
      yar: mockYarSession
    })
    mockH = mockHapiResponseToolkit()

    ConfirmationService.findFormBySlug = vi.fn()
    ConfirmationService.loadConfirmationContent = vi.fn()
    ConfirmationService.processConfirmationContent = vi.fn()
    ConfirmationService.buildViewModel = vi.fn()
    ConfirmationService.hasConfigDrivenConfirmation = vi.fn().mockResolvedValue(true)

    const server = { route: vi.fn() }
    await configConfirmation.plugin.register(server)
    handler = server.route.mock.calls[0][0].handler

    mockFormsCacheService.getState.mockResolvedValue({
      $$__referenceNumber: 'REF123'
    })

    vi.mocked(log).mockClear()
  })

  test('should register plugin correctly', () => {
    expect(configConfirmation.plugin.name).toBe('config-confirmation')
  })

  describe('confirmation flow', () => {
    test('should render confirmation page with valid form and data', async () => {
      const processedConfirmationContent = { html: '<h2>Processed content</h2>' }
      const mockFormDefinition = { metadata: { confirmationContent: mockConfirmationContent } }

      mockYarSession.get
        .mockReturnValueOnce('Test Business')
        .mockReturnValueOnce('123456789')
        .mockReturnValueOnce('Test Contact')

      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent: mockConfirmationContent,
        formDefinition: mockFormDefinition
      })
      ConfirmationService.processConfirmationContent.mockReturnValue(processedConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({ test: 'viewModel' })

      await handler(mockRequest, mockH)

      expect(ConfirmationService.findFormBySlug).toHaveBeenCalledWith('test-slug')
      expect(ConfirmationService.loadConfirmationContent).toHaveBeenCalledWith(mockForm)
      expect(ConfirmationService.processConfirmationContent).toHaveBeenCalledWith(mockConfirmationContent)
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        referenceNumber: 'REF123',
        businessName: 'Test Business',
        sbi: '123456789',
        contactName: 'Test Contact',
        confirmationContent: processedConfirmationContent,
        form: mockForm,
        slug: 'test-slug',
        formDefinition: mockFormDefinition
      })
      expect(mockH.view).toHaveBeenCalledWith('confirmation/views/config-confirmation-page', { test: 'viewModel' })
    })

    test('should return 404 when form not found', async () => {
      ConfirmationService.findFormBySlug.mockReturnValue(null)
      const mockResponse = { code: vi.fn().mockReturnValue('not-found') }
      mockH.response.mockReturnValue(mockResponse)

      const result = await handler(mockRequest, mockH)

      expect(mockResponse.code).toHaveBeenCalledWith(404)
      expect(result).toBe('not-found')
    })

    test('should return 500 when no config-driven content available', async () => {
      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent: null,
        formDefinition: null
      })
      const mockResponse = { code: vi.fn().mockReturnValue('error') }
      mockH.response.mockReturnValue(mockResponse)

      const result = await handler(mockRequest, mockH)

      expect(ConfirmationService.processConfirmationContent).not.toHaveBeenCalled()
      expect(mockResponse.code).toHaveBeenCalledWith(500)
      expect(result).toBe('error')
    })

    test('should handle reference number from confirmation state', async () => {
      const processedConfirmationContent = { html: '<h2>Processed content</h2>' }
      const mockFormDefinition = { metadata: { confirmationContent: mockConfirmationContent } }

      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent: mockConfirmationContent,
        formDefinition: mockFormDefinition
      })
      ConfirmationService.processConfirmationContent.mockReturnValue(processedConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({})

      await handler(mockRequest, mockH)

      expect(ConfirmationService.processConfirmationContent).toHaveBeenCalledWith(mockConfirmationContent)
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith(
        expect.objectContaining({ referenceNumber: 'REF123' })
      )
    })

    test('should handle missing reference number', async () => {
      const processedConfirmationContent = { html: '<h2>Processed content</h2>' }
      const mockFormDefinition = { metadata: { confirmationContent: mockConfirmationContent } }

      mockFormsCacheService.getState.mockResolvedValue({})
      mockYarSession.get.mockReturnValue(undefined)

      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent: mockConfirmationContent,
        formDefinition: mockFormDefinition
      })
      ConfirmationService.processConfirmationContent.mockReturnValue(processedConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({})

      await handler(mockRequest, mockH)

      expect(ConfirmationService.processConfirmationContent).toHaveBeenCalledWith(mockConfirmationContent)
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith(
        expect.objectContaining({ referenceNumber: 'Not available' })
      )
    })

    test('should handle errors gracefully', async () => {
      ConfirmationService.findFormBySlug.mockImplementation(() => {
        throw new Error('Service error')
      })
      const mockResponse = { code: vi.fn().mockReturnValue('error') }
      mockH.response.mockReturnValue(mockResponse)

      const result = await handler(mockRequest, mockH)

      expect(vi.mocked(log)).toHaveBeenCalled()
      expect(mockResponse.code).toHaveBeenCalledWith(500)
      expect(result).toBe('error')
    })
  })
})
