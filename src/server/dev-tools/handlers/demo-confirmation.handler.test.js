import { vi } from 'vitest'
import { demoConfirmationHandler } from './demo-confirmation.handler.js'
import { ConfirmationService } from '../../confirmation/services/confirmation.service.js'
import { buildDemoData, generateFormNotFoundResponse } from '../utils/index.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import {
  createMockLogger,
  MOCK_CONFIRMATION_CONTENT,
  MOCK_FORMS
} from '../../confirmation/__test-fixtures__/confirmation-test-fixtures.js'
import { log } from '../../common/helpers/logging/log.js'

const mockDemoData = {
  referenceNumber: 'DEMO123',
  businessName: 'Demo Business Ltd',
  sbi: '999888777',
  contactName: 'Demo User'
}

vi.mock('../../confirmation/services/confirmation.service.js')
vi.mock('../utils/index.js')
vi.mock('../../common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    CONFIRMATION: {
      CONFIRMATION_ERROR: { level: 'error', messageFunc: vi.fn() }
    }
  }
}))

describe('demo-confirmation.handler', () => {
  let mockRequest
  let mockH
  let mockLogger

  const mockForm = MOCK_FORMS.basic
  const mockConfirmationContent = MOCK_CONFIRMATION_CONTENT.basic

  beforeEach(() => {
    vi.clearAllMocks()

    mockLogger = createMockLogger()
    mockRequest = mockHapiRequest({
      params: { slug: 'test-form' },
      logger: mockLogger
    })
    mockH = mockHapiResponseToolkit()

    buildDemoData.mockReturnValue(mockDemoData)
    ConfirmationService.processConfirmationContent = vi.fn()
  })

  describe('demo confirmation handler', () => {
    test('should render demo confirmation page for valid form', async () => {
      const processedConfirmationContent = { html: '<h2>Processed demo content</h2>' }

      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent: mockConfirmationContent
      })
      ConfirmationService.processConfirmationContent.mockReturnValue(processedConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({ test: 'viewModel' })

      await demoConfirmationHandler(mockRequest, mockH)

      expect(ConfirmationService.findFormBySlug).toHaveBeenCalledWith('test-form')
      expect(ConfirmationService.loadConfirmationContent).toHaveBeenCalledWith(mockForm)
      expect(ConfirmationService.processConfirmationContent).toHaveBeenCalledWith(mockConfirmationContent)
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...mockDemoData,
        confirmationContent: processedConfirmationContent,
        isDevelopmentMode: true,
        form: mockForm,
        slug: 'test-form'
      })
      expect(mockH.view).toHaveBeenCalledWith('confirmation/views/config-confirmation-page', { test: 'viewModel' })
    })

    test('should return form not found response when form does not exist', async () => {
      ConfirmationService.findFormBySlug.mockReturnValue(null)
      generateFormNotFoundResponse.mockReturnValue('not-found-response')

      const result = await demoConfirmationHandler(mockRequest, mockH)

      expect(generateFormNotFoundResponse).toHaveBeenCalledWith('test-form', mockH)
      expect(result).toBe('not-found-response')
    })

    test('should handle null confirmation content with fallback', async () => {
      const fallbackConfirmationContent = {
        html: '<h2>What happens next (Development Mode)</h2><p><strong>⚠️ This is demo content - no configuration found.</strong></p>'
      }

      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent: null,
        formDefinition: null
      })
      ConfirmationService.processConfirmationContent.mockReturnValue(fallbackConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({ test: 'viewModel' })

      await demoConfirmationHandler(mockRequest, mockH)

      expect(ConfirmationService.processConfirmationContent).not.toHaveBeenCalled()
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...mockDemoData,
        confirmationContent: expect.objectContaining({
          html: expect.stringContaining('demo content - no configuration found')
        }),
        isDevelopmentMode: true,
        form: mockForm,
        slug: 'test-form'
      })
    })

    test('should handle errors gracefully with fallback content', async () => {
      const fallbackConfirmationContent = {
        html: '<h2>Development Error</h2><p>Failed to load confirmation content for test-form</p>'
      }

      ConfirmationService.findFormBySlug.mockImplementation(() => {
        throw new Error('Handler error')
      })
      ConfirmationService.processConfirmationContent.mockReturnValue(fallbackConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({ fallback: 'viewModel' })

      await demoConfirmationHandler(mockRequest, mockH)

      expect(vi.mocked(log)).toHaveBeenCalled()
      expect(ConfirmationService.processConfirmationContent).not.toHaveBeenCalled()
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...mockDemoData,
        isDevelopmentMode: true,
        confirmationContent: expect.objectContaining({
          html: expect.stringContaining('Development Error')
        })
      })
    })
  })
})
