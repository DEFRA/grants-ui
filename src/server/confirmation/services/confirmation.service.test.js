import { vi } from 'vitest'
import { ConfirmationService } from './confirmation.service.js'

const mockFormsService = {
  getFormDefinition: vi.fn()
}

const mockFormCache = [
  { id: 'form1', slug: 'test-form', title: 'Test Form' },
  { id: 'form2', slug: 'another-form', title: 'Another Form' },
  { id: 'form3', slug: 'example-grant', title: 'Example Grant' }
]

vi.mock('~/src/server/common/forms/services/form.js', () => ({
  formsService: vi.fn(() => Promise.resolve(mockFormsService)),
  getFormsCache: vi.fn(() => mockFormCache)
}))

describe('ConfirmationService', () => {
  let mockLogger

  beforeEach(() => {
    vi.clearAllMocks()

    mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    }
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

    test('should return null when slug is undefined', () => {
      const result = ConfirmationService.findFormBySlug(undefined)

      expect(result).toBeNull()
    })

    test('should return null when slug is empty string', () => {
      const result = ConfirmationService.findFormBySlug('')

      expect(result).toBeNull()
    })

    const testSlugs = [
      { slug: 'test-form', expectedTitle: 'Test Form' },
      { slug: 'another-form', expectedTitle: 'Another Form' },
      { slug: 'example-grant', expectedTitle: 'Example Grant' }
    ]

    test.each(testSlugs)(
      'should find form with slug "$slug" and return correct title',
      ({ slug, expectedTitle }) => {
        const result = ConfirmationService.findFormBySlug(slug)

        expect(result).toBeTruthy()
        expect(result.title).toBe(expectedTitle)
        expect(result.slug).toBe(slug)
      }
    )
  })

  describe('loadConfirmationContent', () => {
    const validForm = { id: 'test-form-id', slug: 'test-form' }

    test('should return null when form is invalid', async () => {
      const result = await ConfirmationService.loadConfirmationContent(null, mockLogger)

      expect(result).toBeNull()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid form object provided to loadConfirmationContent',
        { form: null }
      )
    })

    test('should return null when form has no id', async () => {
      const invalidForm = { slug: 'test-form' }

      const result = await ConfirmationService.loadConfirmationContent(invalidForm, mockLogger)

      expect(result).toBeNull()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid form object provided to loadConfirmationContent',
        { form: invalidForm }
      )
    })

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

    test('should return null when form definition has no metadata', async () => {
      mockFormsService.getFormDefinition.mockResolvedValue({})

      const result = await ConfirmationService.loadConfirmationContent(validForm, mockLogger)

      expect(result).toBeNull()
    })

    test('should handle service errors gracefully', async () => {
      const testError = new Error('Service error')
      mockFormsService.getFormDefinition.mockRejectedValue(testError)

      const result = await ConfirmationService.loadConfirmationContent(validForm, mockLogger)

      expect(result).toBeNull()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to load form configuration',
        {
          error: 'Service error',
          slug: 'test-form',
          formId: 'test-form-id'
        }
      )
    })

    test('should handle missing logger gracefully', async () => {
      const result = await ConfirmationService.loadConfirmationContent(null, null)

      expect(result).toBeNull()
    })

    const invalidFormCases = [
      { form: undefined, description: 'undefined' },
      { form: null, description: 'null' },
      { form: {}, description: 'empty object' },
      { form: { slug: 'test' }, description: 'object without id' }
    ]

    test.each(invalidFormCases)(
      'should return null for $description form',
      async ({ form }) => {
        const result = await ConfirmationService.loadConfirmationContent(form, mockLogger)

        expect(result).toBeNull()
        expect(mockLogger.warn).toHaveBeenCalled()
      }
    )
  })

  describe('buildViewModel', () => {
    const baseOptions = {
      referenceNumber: 'REF123',
      businessName: 'Test Business Ltd',
      sbi: '123456789',
      contactName: 'John Doe',
      confirmationContent: { html: '<h2>Test content</h2>' }
    }

    const expectedBaseModel = {
      referenceNumber: 'REF123',
      businessName: 'Test Business Ltd',
      sbi: '123456789',
      contactName: 'John Doe',
      confirmationContent: { html: '<h2>Test content</h2>' },
      serviceName: 'Manage land-based actions',
      serviceUrl: '/find-funding-for-land-or-farms',
      auth: {},
      breadcrumbs: []
    }

    test('should build basic view model in production mode', () => {
      const result = ConfirmationService.buildViewModel(baseOptions)

      expect(result).toEqual(expectedBaseModel)
    })

    test('should build development mode view model', () => {
      const options = {
        ...baseOptions,
        isDevelopmentMode: true,
        form: { title: 'Test Form' },
        slug: 'test-form'
      }

      const result = ConfirmationService.buildViewModel(options)

      expect(result).toEqual({
        ...expectedBaseModel,
        isDevelopmentMode: true,
        formTitle: 'Test Form',
        formSlug: 'test-form',
        usingSessionData: false
      })
    })

    test('should handle missing optional properties', () => {
      const minimalOptions = {
        referenceNumber: 'REF123',
        confirmationContent: { html: '<h2>Test</h2>' }
      }

      const result = ConfirmationService.buildViewModel(minimalOptions)

      expect(result).toEqual({
        referenceNumber: 'REF123',
        businessName: undefined,
        sbi: undefined,
        contactName: undefined,
        confirmationContent: { html: '<h2>Test</h2>' },
        serviceName: 'Manage land-based actions',
        serviceUrl: '/find-funding-for-land-or-farms',
        auth: {},
        breadcrumbs: []
      })
    })

    test('should handle development mode with missing form properties', () => {
      const options = {
        ...baseOptions,
        isDevelopmentMode: true
      }

      const result = ConfirmationService.buildViewModel(options)

      expect(result).toEqual({
        ...expectedBaseModel,
        isDevelopmentMode: true,
        formTitle: undefined,
        formSlug: null,
        usingSessionData: false
      })
    })

    const defaultValues = [
      { property: 'isDevelopmentMode', defaultValue: false },
      { property: 'form', defaultValue: null },
      { property: 'slug', defaultValue: null }
    ]

    test.each(defaultValues)(
      'should use default value for $property when not provided',
      ({ property, defaultValue }) => {
        const options = { ...baseOptions }
        delete options[property]

        const result = ConfirmationService.buildViewModel(options)

        if (property === 'isDevelopmentMode' && defaultValue === false) {
          expect(result.isDevelopmentMode).toBeUndefined()
        }
      }
    )

    const developmentModeScenarios = [
      {
        name: 'with form and slug',
        options: { isDevelopmentMode: true, form: { title: 'Form Title' }, slug: 'form-slug' },
        expectedProps: { formTitle: 'Form Title', formSlug: 'form-slug' }
      },
      {
        name: 'with form but no slug',
        options: { isDevelopmentMode: true, form: { title: 'Form Title' } },
        expectedProps: { formTitle: 'Form Title', formSlug: null }
      },
      {
        name: 'with slug but no form',
        options: { isDevelopmentMode: true, slug: 'form-slug' },
        expectedProps: { formTitle: undefined, formSlug: 'form-slug' }
      },
      {
        name: 'without form or slug',
        options: { isDevelopmentMode: true },
        expectedProps: { formTitle: undefined, formSlug: null }
      }
    ]

    test.each(developmentModeScenarios)(
      'should build development view model $name',
      ({ options, expectedProps }) => {
        const fullOptions = { ...baseOptions, ...options }

        const result = ConfirmationService.buildViewModel(fullOptions)

        expect(result).toEqual({
          ...expectedBaseModel,
          isDevelopmentMode: true,
          usingSessionData: false,
          ...expectedProps
        })
      }
    )
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

    test('should return false when form is invalid', async () => {
      const result = await ConfirmationService.hasConfigDrivenConfirmation(null, mockLogger)

      expect(result).toBe(false)
    })

    test('should return false when service throws error', async () => {
      mockFormsService.getFormDefinition.mockRejectedValue(new Error('Service error'))

      const result = await ConfirmationService.hasConfigDrivenConfirmation(testForm, mockLogger)

      expect(result).toBe(false)
    })

    const confirmationContentScenarios = [
      { content: { html: '<h2>Test</h2>' }, expected: true, description: 'HTML content' },
      { content: { text: 'Test text' }, expected: true, description: 'text content' },
      { content: {}, expected: true, description: 'empty object' },
      { content: null, expected: false, description: 'null content' },
      { content: undefined, expected: false, description: 'undefined content' }
    ]

    test.each(confirmationContentScenarios)(
      'should return $expected for $description',
      async ({ content, expected }) => {
        mockFormsService.getFormDefinition.mockResolvedValue({
          metadata: {
            confirmationContent: content
          }
        })

        const result = await ConfirmationService.hasConfigDrivenConfirmation(testForm, mockLogger)

        expect(result).toBe(expected)
      }
    )
  })
})