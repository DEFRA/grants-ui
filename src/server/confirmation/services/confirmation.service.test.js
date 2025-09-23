import { vi } from 'vitest'
import { ConfirmationService } from './confirmation.service.js'
import { MOCK_FORM_CACHE, createMockLogger } from '../__test-fixtures__/confirmation-test-fixtures.js'

const mockFormsService = {
  getFormDefinition: vi.fn()
}

vi.mock('~/src/server/common/forms/services/form.js', () => ({
  formsService: vi.fn(() => Promise.resolve(mockFormsService)),
  getFormsCache: vi.fn(() => MOCK_FORM_CACHE)
}))

describe('ConfirmationService', () => {
  let mockLogger

  beforeEach(() => {
    vi.clearAllMocks()
    mockLogger = createMockLogger()
  })

  describe('findFormBySlug', () => {
    test('should return form when slug exists', () => {
      const result = ConfirmationService.findFormBySlug('test-form')

      expect(result).toEqual({
        id: 'form1',
        slug: 'test-form',
        title: 'Test Form'
      })
    })

    test('should return null when slug does not exist', () => {
      const result = ConfirmationService.findFormBySlug('non-existent-form')

      expect(result).toBeNull()
    })
  })

  describe('loadConfirmationContent', () => {
    const validForm = { id: 'test-form-id', slug: 'test-form' }

    test('should return confirmation content when available', async () => {
      const mockConfirmationContent = {
        html: '<h2>Test confirmation content</h2>'
      }

      mockFormsService.getFormDefinition.mockResolvedValue({
        metadata: {
          confirmationContent: mockConfirmationContent
        }
      })

      const result = await ConfirmationService.loadConfirmationContent(validForm, mockLogger)

      expect(mockFormsService.getFormDefinition).toHaveBeenCalledWith('test-form-id')
      expect(result).toEqual(mockConfirmationContent)
    })

    test('should return null when no confirmation content exists', async () => {
      mockFormsService.getFormDefinition.mockResolvedValue({
        metadata: {}
      })

      const result = await ConfirmationService.loadConfirmationContent(validForm, mockLogger)

      expect(result).toBeNull()
    })

    test('should handle service errors gracefully', async () => {
      mockFormsService.getFormDefinition.mockRejectedValue(new Error('Service error'))

      const result = await ConfirmationService.loadConfirmationContent(validForm, mockLogger)

      expect(result).toBeNull()
      expect(mockLogger.warn).toHaveBeenCalled()
    })

    test('should handle invalid form gracefully', async () => {
      const result = await ConfirmationService.loadConfirmationContent(null, mockLogger)

      expect(result).toBeNull()
    })
  })

  describe('buildViewModel', () => {
    const baseOptions = {
      referenceNumber: 'REF123',
      businessName: 'Test Business Ltd',
      sbi: '123456789',
      contactName: 'John Doe',
      confirmationContent: { html: '<h2>Test content</h2>' }
    }

    test('should build basic view model', () => {
      const result = ConfirmationService.buildViewModel(baseOptions)

      expect(result).toEqual({
        referenceNumber: 'REF123',
        businessName: 'Test Business Ltd',
        sbi: '123456789',
        contactName: 'John Doe',
        confirmationContent: { html: '<h2>Test content</h2>' },
        serviceName: 'Manage land-based actions',
        serviceUrl: '/find-funding-for-land-or-farms',
        auth: {},
        breadcrumbs: []
      })
    })

    test('should include development mode properties when enabled', () => {
      const options = {
        ...baseOptions,
        isDevelopmentMode: true,
        form: { title: 'Test Form' },
        slug: 'test-form'
      }

      const result = ConfirmationService.buildViewModel(options)

      expect(result.isDevelopmentMode).toBe(true)
      expect(result.formTitle).toBe('Test Form')
      expect(result.formSlug).toBe('test-form')
    })
  })

  describe('hasConfigDrivenConfirmation', () => {
    const testForm = { id: 'test-form-id', slug: 'test-form' }

    test('should return true when confirmation content exists', async () => {
      mockFormsService.getFormDefinition.mockResolvedValue({
        metadata: {
          confirmationContent: { html: '<h2>Test content</h2>' }
        }
      })

      const result = await ConfirmationService.hasConfigDrivenConfirmation(testForm, mockLogger)

      expect(result).toBe(true)
    })

    test('should return false when no confirmation content exists', async () => {
      mockFormsService.getFormDefinition.mockResolvedValue({
        metadata: {}
      })

      const result = await ConfirmationService.hasConfigDrivenConfirmation(testForm, mockLogger)

      expect(result).toBe(false)
    })

    test('should return false when service fails', async () => {
      mockFormsService.getFormDefinition.mockRejectedValue(new Error('Service error'))

      const result = await ConfirmationService.hasConfigDrivenConfirmation(testForm, mockLogger)

      expect(result).toBe(false)
    })
  })
})
