import { vi } from 'vitest'
import { ConfirmationService } from './confirmation.service.js'
import { ComponentsRegistry } from './components.registry.js'
import { MOCK_FORM_CACHE } from '../__test-fixtures__/confirmation-test-fixtures.js'

vi.mock('~/src/server/common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => MOCK_FORM_CACHE)
}))

vi.mock('./components.registry.js', () => ({
  ComponentsRegistry: {
    replaceComponents: vi.fn()
  }
}))

describe('ConfirmationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ComponentsRegistry.replaceComponents.mockImplementation((content) => content)
  })

  describe('findFormBySlug', () => {
    test('should return form when slug exists', () => {
      const result = ConfirmationService.findFormBySlug('test-form')

      expect(result).toEqual({
        id: 'form1',
        slug: 'test-form',
        title: 'Test Form',
        metadata: {
          confirmationContent: {
            html: '<h2>Test confirmation content</h2>'
          }
        }
      })
    })

    test('should return null when slug does not exist', () => {
      const result = ConfirmationService.findFormBySlug('non-existent-form')

      expect(result).toBeNull()
    })
  })

  describe('loadConfirmationContent', () => {
    test('should return confirmation content when available', async () => {
      const validForm = MOCK_FORM_CACHE[0]
      const result = await ConfirmationService.loadConfirmationContent(validForm)

      expect(result).toEqual({
        confirmationContent: MOCK_FORM_CACHE[0].metadata.confirmationContent
      })
    })

    test('should return null when no confirmation content exists', async () => {
      const formWithNoConfirmationContetn = MOCK_FORM_CACHE[1]

      const result = await ConfirmationService.loadConfirmationContent(formWithNoConfirmationContetn)

      expect(result).toEqual({
        confirmationContent: null
      })
    })

    test('should handle invalid form gracefully', async () => {
      const result = await ConfirmationService.loadConfirmationContent(null)

      expect(result).toEqual({
        confirmationContent: null
      })
    })
  })

  describe('buildViewModel', () => {
    const baseOptions = {
      referenceNumber: 'REF123',
      businessName: 'Test Business Ltd',
      sbi: '123456789',
      contactName: 'John Doe',
      confirmationContent: { html: '<h2>Test content</h2>' },
      form: { title: 'Test Form' },
      slug: 'test-form'
    }

    test('should build basic view model', () => {
      const result = ConfirmationService.buildViewModel(baseOptions)

      expect(result).toEqual({
        pageTitle: 'Confirmation',
        referenceNumber: 'REF123',
        businessName: 'Test Business Ltd',
        sbi: '123456789',
        contactName: 'John Doe',
        confirmationContent: { html: '<h2>Test content</h2>' },
        serviceName: 'Test Form',
        serviceUrl: '/test-form',
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
      expect(result.formSlug).toBe('/test-form')
      expect(result.auth.name).toBe('Dev Mode User')
      expect(result.auth.organisationName).toBe('Dev Mode Organisation')
      expect(result.auth.organisationId).toBe('999999999')
    })
  })

  describe('hasConfigDrivenConfirmation', () => {
    test('should return true when confirmation content exists', async () => {
      const testForm = MOCK_FORM_CACHE[0]
      const result = await ConfirmationService.hasConfigDrivenConfirmation(testForm)

      expect(result).toBe(true)
    })

    test('should return false when no confirmation content exists', async () => {
      const testForm = MOCK_FORM_CACHE[1]
      const result = await ConfirmationService.hasConfigDrivenConfirmation(testForm)

      expect(result).toBe(false)
    })
  })

  describe('processConfirmationContent', () => {
    test('should process confirmation content with HTML and replace components', () => {
      const rawContent = {
        html: '<h2>Test content</h2> {{TESTCOMPONENT}}'
      }
      const processedHtml = '<h2>Test content</h2> <div>Test Component</div>'

      ComponentsRegistry.replaceComponents.mockReturnValue(processedHtml)

      const result = ConfirmationService.processConfirmationContent(rawContent)

      expect(ComponentsRegistry.replaceComponents).toHaveBeenCalledWith('<h2>Test content</h2> {{TESTCOMPONENT}}')
      expect(result).toEqual({
        html: processedHtml
      })
    })

    test('should preserve other properties while processing HTML', () => {
      const rawContent = {
        html: '<h2>Test content</h2> {{TESTCOMPONENT}}',
        title: 'Test Title',
        metadata: { key: 'value' }
      }
      const processedHtml = '<h2>Test content</h2> <div>Test Component</div>'

      ComponentsRegistry.replaceComponents.mockReturnValue(processedHtml)

      const result = ConfirmationService.processConfirmationContent(rawContent)

      expect(result).toEqual({
        html: processedHtml,
        title: 'Test Title',
        metadata: { key: 'value' }
      })
    })

    test('should return content unchanged if no HTML property', () => {
      const rawContent = {
        title: 'Test Title',
        metadata: { key: 'value' }
      }

      const result = ConfirmationService.processConfirmationContent(rawContent)

      expect(ComponentsRegistry.replaceComponents).not.toHaveBeenCalled()
      expect(result).toEqual(rawContent)
    })

    test('should return null for null input', () => {
      const result = ConfirmationService.processConfirmationContent(null)

      expect(ComponentsRegistry.replaceComponents).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    test('should handle empty HTML content', () => {
      const rawContent = {
        html: ''
      }

      const result = ConfirmationService.processConfirmationContent(rawContent)

      expect(ComponentsRegistry.replaceComponents).not.toHaveBeenCalled()
      expect(result).toEqual({
        html: ''
      })
    })
  })
})
