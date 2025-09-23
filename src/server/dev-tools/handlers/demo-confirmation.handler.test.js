import { vi } from 'vitest'
import { demoConfirmationHandler } from './demo-confirmation.handler.js'
import { ConfirmationService } from '../../confirmation/services/confirmation.service.js'
import { generateFormNotFoundResponse, buildDemoData } from '../utils/index.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import {
  MOCK_FORMS,
  MOCK_CONFIRMATION_CONTENT,
  createMockLogger
} from '../../confirmation/__test-fixtures__/confirmation-test-fixtures.js'

const mockDemoData = {
  referenceNumber: 'DEMO123',
  businessName: 'Demo Business Ltd',
  sbi: '999888777',
  contactName: 'Demo User'
}

vi.mock('../../confirmation/services/confirmation.service.js')
vi.mock('../utils/index.js')

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
  })

  describe('demo confirmation handler', () => {
    test('should render demo confirmation page for valid form', async () => {
      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue(mockConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue({ test: 'viewModel' })

      await demoConfirmationHandler(mockRequest, mockH)

      expect(ConfirmationService.findFormBySlug).toHaveBeenCalledWith('test-form')
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...mockDemoData,
        confirmationContent: mockConfirmationContent,
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

    test('should handle errors gracefully with fallback content', async () => {
      ConfirmationService.findFormBySlug.mockImplementation(() => {
        throw new Error('Handler error')
      })
      ConfirmationService.buildViewModel.mockReturnValue({ fallback: 'viewModel' })

      await demoConfirmationHandler(mockRequest, mockH)

      expect(mockLogger.error).toHaveBeenCalledWith('Demo confirmation route error', {
        error: 'Handler error'
      })
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
