import { vi } from 'vitest'
import { demoConfirmationHandler } from './demo-confirmation.handler.js'
import { findFormBySlug } from '../../common/forms/services/find-form-by-slug.js'
import { ConfirmationService } from '../../confirmation/services/confirmation.service.js'
import { buildDemoData } from '../helpers/index.js'
import { generateFormNotFoundResponse } from '../utils/index.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { mockRequestLogger } from '~/src/__mocks__/logger-mocks.js'
import {
  MOCK_CONFIRMATION_CONTENT,
  MOCK_FORMS
} from '../../confirmation/__test-fixtures__/confirmation-test-fixtures.js'
import { MOCK_DEMO_DATA } from '../__test-fixtures__/mock-demo-data.js'

vi.mock('../../common/forms/services/find-form-by-slug.js')
vi.mock('../../confirmation/services/confirmation.service.js')
vi.mock('../helpers/index.js')
vi.mock('../utils/index.js')
vi.mock('../../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})

describe('demo-confirmation.handler', () => {
  let mockRequest
  let mockH
  let mockLogger

  const mockForm = MOCK_FORMS.basic
  const mockConfirmationContent = MOCK_CONFIRMATION_CONTENT.basic

  beforeEach(() => {
    vi.clearAllMocks()

    mockLogger = mockRequestLogger()
    mockRequest = mockHapiRequest({
      params: { slug: 'test-form' },
      logger: mockLogger
    })
    mockH = mockHapiResponseToolkit()

    buildDemoData.mockReturnValue(MOCK_DEMO_DATA)
    ConfirmationService.processConfirmationContent = vi.fn()
  })

  describe('demo confirmation handler', () => {
    test('should render demo confirmation page for valid form', async () => {
      const processedConfirmationContent = { html: '<h2>Processed demo content</h2>' }

      findFormBySlug.mockResolvedValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent: mockConfirmationContent
      })
      ConfirmationService.processConfirmationContent.mockReturnValue(processedConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({ test: 'viewModel' })

      await demoConfirmationHandler(mockRequest, mockH)

      expect(findFormBySlug).toHaveBeenCalledWith('test-form')
      expect(ConfirmationService.loadConfirmationContent).toHaveBeenCalledWith(mockForm)
      expect(ConfirmationService.processConfirmationContent).toHaveBeenCalledWith(mockConfirmationContent, 'test-slug')
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...MOCK_DEMO_DATA,
        confirmationContent: processedConfirmationContent,
        isDevelopmentMode: true,
        form: mockForm,
        slug: 'test-form'
      })
      expect(mockH.view).toHaveBeenCalledWith('config-confirmation-page', { test: 'viewModel' })
    })

    test('should return form not found response when form does not exist', async () => {
      findFormBySlug.mockResolvedValue(null)
      generateFormNotFoundResponse.mockResolvedValue('not-found-response')

      const result = await demoConfirmationHandler(mockRequest, mockH)

      expect(generateFormNotFoundResponse).toHaveBeenCalledWith('test-form', mockH)
      expect(result).toBe('not-found-response')
    })

    test('should handle null confirmation content with fallback', async () => {
      const fallbackConfirmationContent = {
        html: '<h2>What happens next (Development Mode)</h2><p><strong>⚠️ This is demo content - no configuration found.</strong></p>'
      }

      findFormBySlug.mockResolvedValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue({
        confirmationContent: null,
        formDefinition: null
      })
      ConfirmationService.processConfirmationContent.mockReturnValue(fallbackConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({ test: 'viewModel' })

      await demoConfirmationHandler(mockRequest, mockH)

      expect(ConfirmationService.processConfirmationContent).not.toHaveBeenCalled()
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...MOCK_DEMO_DATA,
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

      findFormBySlug.mockRejectedValue(new Error('Handler error'))
      ConfirmationService.processConfirmationContent.mockReturnValue(fallbackConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({ fallback: 'viewModel' })

      await demoConfirmationHandler(mockRequest, mockH)

      expect(ConfirmationService.processConfirmationContent).not.toHaveBeenCalled()
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...MOCK_DEMO_DATA,
        isDevelopmentMode: true,
        confirmationContent: expect.objectContaining({
          html: expect.stringContaining('Development Error')
        })
      })
    })
  })
})
