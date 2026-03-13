import { vi } from 'vitest'
import { ConfirmationService } from './confirmation.service.js'
import { ComponentsRegistry } from './components.registry.js'
import { config } from '~/src/config/config.js'
import { MOCK_FORM_CACHE } from '../__test-fixtures__/confirmation-test-fixtures.js'

vi.mock('./components.registry.js', () => ({
  ComponentsRegistry: {
    replaceComponents: vi.fn()
  }
}))

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn()
  }
}))

describe('ConfirmationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ComponentsRegistry.replaceComponents.mockImplementation((content) => content)
    config.get.mockReturnValue(true)
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
      const formWithNoConfirmationContent = MOCK_FORM_CACHE[1]

      const result = await ConfirmationService.loadConfirmationContent(formWithNoConfirmationContent)

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
      const result = ConfirmationService.buildViewModel({
        ...baseOptions,
        isDevelopmentMode: true
      })

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

    test('should replace {{SLUG}} placeholders with provided slug', () => {
      const rawContent = {
        html: '<a href="/{{SLUG}}/page">Link</a>'
      }

      const result = ConfirmationService.processConfirmationContent(rawContent, 'farm-payments')

      expect(result.html).toBe('<a href="/farm-payments/page">Link</a>')
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

    test('should return content unchanged for empty HTML', () => {
      const rawContent = { html: '' }

      const result = ConfirmationService.processConfirmationContent(rawContent)

      expect(ComponentsRegistry.replaceComponents).not.toHaveBeenCalled()
      expect(result).toEqual(rawContent)
    })

    test('should strip print link for farm-payments when enablePrintApplication flag is off', () => {
      config.get.mockImplementation((key) => {
        return key !== 'landGrants.enablePrintApplication'
      })

      const rawContent = {
        html: '<p>Some content</p>\n\n      <p class="govuk-body"><a class="govuk-link" href="/farm-payments/print-submitted-application" target="_blank">View / Print submitted application (opens in new tab)</a></p>\n\n      <p>More content</p>'
      }

      const result = ConfirmationService.processConfirmationContent(rawContent, 'farm-payments')

      expect(result.html).not.toContain('print-submitted-application')
      expect(result.html).toContain('Some content')
      expect(result.html).toContain('More content')
    })

    test('should keep print link for farm-payments when enablePrintApplication flag is on', () => {
      const rawContent = {
        html: '<p class="govuk-body"><a class="govuk-link" href="/{{SLUG}}/print-submitted-application" target="_blank">View / Print submitted application (opens in new tab)</a></p>'
      }

      const result = ConfirmationService.processConfirmationContent(rawContent, 'farm-payments')

      expect(result.html).toContain('print-submitted-application')
    })

    test('should not strip print link for non-farm-payments forms even when flag is off', () => {
      config.get.mockImplementation((key) => {
        return key !== 'landGrants.enablePrintApplication'
      })

      const rawContent = {
        html: '<p class="govuk-body"><a class="govuk-link" href="/methane/print-submitted-application" target="_blank">View / Print submitted application (opens in new tab)</a></p>'
      }

      const result = ConfirmationService.processConfirmationContent(rawContent, 'methane')

      expect(result.html).toContain('print-submitted-application')
    })
  })
})
