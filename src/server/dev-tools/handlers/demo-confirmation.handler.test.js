import { vi } from 'vitest'
import {
  loadConfirmationContent,
  buildViewModel,
  generateFallbackViewModel,
  demoConfirmationHandler
} from './demo-confirmation.handler.js'
import { ConfirmationService } from '../../confirmation/services/confirmation.service.js'
import { generateFormNotFoundResponse, buildDemoData } from '../utils/index.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('../../confirmation/services/confirmation.service.js')
vi.mock('../utils/index.js')

describe('demo-confirmation.handler', () => {
  let mockRequest
  let mockH
  let mockLogger

  const mockForm = {
    id: 'test-form-id',
    slug: 'test-form',
    title: 'Test Form'
  }

  const mockDemoData = {
    referenceNumber: 'DEMO123',
    businessName: 'Demo Business Ltd',
    sbi: '999888777',
    contactName: 'Demo User'
  }

  const mockConfirmationContent = {
    html: '<h2>Demo confirmation content</h2>'
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockLogger = {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn()
    }

    mockRequest = mockHapiRequest({
      params: { slug: 'test-form' },
      logger: mockLogger
    })

    mockH = mockHapiResponseToolkit()

    buildDemoData.mockReturnValue(mockDemoData)
  })

  describe('loadConfirmationContent', () => {
    test('should return confirmation content when available', async () => {
      ConfirmationService.loadConfirmationContent.mockResolvedValue(mockConfirmationContent)

      const result = await loadConfirmationContent(mockForm, mockRequest)

      expect(ConfirmationService.loadConfirmationContent).toHaveBeenCalledWith(mockForm, mockLogger)
      expect(result).toEqual(mockConfirmationContent)
    })

    test('should return fallback content when no confirmation content found', async () => {
      ConfirmationService.loadConfirmationContent.mockResolvedValue(null)

      const result = await loadConfirmationContent(mockForm, mockRequest)

      expect(result).toEqual({
        html: `<h2 class="govuk-heading-m">What happens next (Development Mode)</h2>
             <p class="govuk-body"><strong>⚠️ This is demo content - no configuration found.</strong></p>
             <p class="govuk-body">Form: ${mockForm.title} (${mockForm.slug})</p>
             <p class="govuk-body">Showing fallback demonstration content...</p>`
      })
    })

    test('should handle service errors gracefully', async () => {
      ConfirmationService.loadConfirmationContent.mockRejectedValue(new Error('Service error'))

      await expect(loadConfirmationContent(mockForm, mockRequest)).rejects.toThrow('Service error')
    })

    const formVariations = [
      {
        form: { id: 'form1', slug: 'test-slug', title: 'Test Title' },
        expectedHtml: '<h2 class="govuk-heading-m">What happens next (Development Mode)</h2>\n             <p class="govuk-body"><strong>⚠️ This is demo content - no configuration found.</strong></p>\n             <p class="govuk-body">Form: Test Title (test-slug)</p>\n             <p class="govuk-body">Showing fallback demonstration content...</p>'
      },
      {
        form: { id: 'form2', slug: 'another-form', title: 'Another Form' },
        expectedHtml: '<h2 class="govuk-heading-m">What happens next (Development Mode)</h2>\n             <p class="govuk-body"><strong>⚠️ This is demo content - no configuration found.</strong></p>\n             <p class="govuk-body">Form: Another Form (another-form)</p>\n             <p class="govuk-body">Showing fallback demonstration content...</p>'
      }
    ]

    test.each(formVariations)(
      'should generate correct fallback content for form "$form.title"',
      async ({ form, expectedHtml }) => {
        ConfirmationService.loadConfirmationContent.mockResolvedValue(null)

        const result = await loadConfirmationContent(form, mockRequest)

        expect(result.html).toBe(expectedHtml)
      }
    )
  })

  describe('buildViewModel', () => {
    test('should build view model with development mode enabled', () => {
      const expectedViewModel = {
        ...mockDemoData,
        confirmationContent: mockConfirmationContent,
        isDevelopmentMode: true,
        form: mockForm,
        slug: mockForm.slug
      }

      ConfirmationService.buildViewModel.mockReturnValue(expectedViewModel)

      const result = buildViewModel(mockDemoData, mockConfirmationContent, mockForm, mockForm.slug)

      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...mockDemoData,
        confirmationContent: mockConfirmationContent,
        isDevelopmentMode: true,
        form: mockForm,
        slug: mockForm.slug
      })
      expect(result).toEqual(expectedViewModel)
    })

    test('should handle missing parameters', () => {
      const partialDemoData = { referenceNumber: 'REF123' }
      const expectedViewModel = { basic: 'model' }

      ConfirmationService.buildViewModel.mockReturnValue(expectedViewModel)

      const result = buildViewModel(partialDemoData, null, null, null)

      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...partialDemoData,
        confirmationContent: null,
        isDevelopmentMode: true,
        form: null,
        slug: null
      })
      expect(result).toEqual(expectedViewModel)
    })

    const buildViewModelScenarios = [
      {
        name: 'with complete data',
        demoData: mockDemoData,
        content: mockConfirmationContent,
        form: mockForm,
        slug: 'test-slug'
      },
      {
        name: 'with minimal data',
        demoData: { referenceNumber: 'REF123' },
        content: { html: '<p>Simple content</p>' },
        form: { id: 'simple', title: 'Simple' },
        slug: 'simple-form'
      },
      {
        name: 'with empty data',
        demoData: {},
        content: {},
        form: {},
        slug: ''
      }
    ]

    test.each(buildViewModelScenarios)(
      'should build view model $name',
      ({ demoData, content, form, slug }) => {
        const expectedViewModel = { test: 'result' }
        ConfirmationService.buildViewModel.mockReturnValue(expectedViewModel)

        const result = buildViewModel(demoData, content, form, slug)

        expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
          ...demoData,
          confirmationContent: content,
          isDevelopmentMode: true,
          form,
          slug
        })
        expect(result).toEqual(expectedViewModel)
      }
    )
  })

  describe('generateFallbackViewModel', () => {
    test('should generate fallback view model with error details', () => {
      const testError = new Error('Test error message')
      const expectedViewModel = { fallback: 'model' }

      ConfirmationService.buildViewModel.mockReturnValue(expectedViewModel)

      const result = generateFallbackViewModel(testError)

      expect(buildDemoData).toHaveBeenCalled()
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...mockDemoData,
        isDevelopmentMode: true,
        confirmationContent: {
          html: `<h2 class="govuk-heading-m">Development Error</h2>
             <p class="govuk-body"><strong>⚠️ Development mode error occurred.</strong></p>
             <p class="govuk-body">Error: Test error message</p>
             <p class="govuk-body">This page is for development testing only.</p>`
        }
      })
      expect(result).toEqual(expectedViewModel)
    })

    test('should handle errors with special characters', () => {
      const testError = new Error('Error with "quotes" and <tags>')

      generateFallbackViewModel(testError)

      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...mockDemoData,
        isDevelopmentMode: true,
        confirmationContent: {
          html: `<h2 class="govuk-heading-m">Development Error</h2>
             <p class="govuk-body"><strong>⚠️ Development mode error occurred.</strong></p>
             <p class="govuk-body">Error: Error with "quotes" and <tags></p>
             <p class="govuk-body">This page is for development testing only.</p>`
        }
      })
    })

    const errorMessages = [
      'Simple error',
      'Error with special chars: !@#$%^&*()',
      'Very long error message that contains multiple sentences and describes a complex error condition that occurred during processing.',
      ''
    ]

    test.each(errorMessages)(
      'should handle error message: "%s"',
      (errorMessage) => {
        const testError = new Error(errorMessage)

        generateFallbackViewModel(testError)

        expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith(
          expect.objectContaining({
            confirmationContent: expect.objectContaining({
              html: expect.stringContaining(`Error: ${errorMessage}`)
            })
          })
        )
      }
    )
  })

  describe('demoConfirmationHandler', () => {
    test('should successfully render confirmation page for valid form', async () => {
      const expectedViewModel = { test: 'viewModel' }
      const mockViewResponse = 'view-response'

      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockResolvedValue(mockConfirmationContent)
      ConfirmationService.buildViewModel.mockReturnValue(expectedViewModel)
      mockH.view.mockReturnValue(mockViewResponse)

      const result = await demoConfirmationHandler(mockRequest, mockH)

      expect(ConfirmationService.findFormBySlug).toHaveBeenCalledWith('test-form')
      expect(ConfirmationService.loadConfirmationContent).toHaveBeenCalledWith(mockForm, mockLogger)
      expect(buildDemoData).toHaveBeenCalled()
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...mockDemoData,
        confirmationContent: mockConfirmationContent,
        isDevelopmentMode: true,
        form: mockForm,
        slug: 'test-form'
      })
      expect(mockH.view).toHaveBeenCalledWith('confirmation/views/config-confirmation-page', expectedViewModel)
      expect(result).toBe(mockViewResponse)
    })

    test('should return form not found response when form does not exist', async () => {
      const mockNotFoundResponse = 'not-found-response'

      ConfirmationService.findFormBySlug.mockReturnValue(null)
      generateFormNotFoundResponse.mockReturnValue(mockNotFoundResponse)

      const result = await demoConfirmationHandler(mockRequest, mockH)

      expect(ConfirmationService.findFormBySlug).toHaveBeenCalledWith('test-form')
      expect(generateFormNotFoundResponse).toHaveBeenCalledWith('test-form', mockH)
      expect(result).toBe(mockNotFoundResponse)
    })

    test('should return fallback view model when error occurs', async () => {
      const testError = new Error('Handler error')
      const fallbackViewModel = { fallback: 'viewModel' }
      const mockViewResponse = 'fallback-view-response'

      ConfirmationService.findFormBySlug.mockImplementation(() => {
        throw testError
      })
      ConfirmationService.buildViewModel.mockReturnValue(fallbackViewModel)
      mockH.view.mockReturnValue(mockViewResponse)

      const result = await demoConfirmationHandler(mockRequest, mockH)

      expect(mockLogger.error).toHaveBeenCalledWith('Demo confirmation route error', {
        error: 'Handler error'
      })
      expect(buildDemoData).toHaveBeenCalled()
      expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith({
        ...mockDemoData,
        isDevelopmentMode: true,
        confirmationContent: {
          html: `<h2 class="govuk-heading-m">Development Error</h2>
             <p class="govuk-body"><strong>⚠️ Development mode error occurred.</strong></p>
             <p class="govuk-body">Error: Handler error</p>
             <p class="govuk-body">This page is for development testing only.</p>`
        }
      })
      expect(mockH.view).toHaveBeenCalledWith('confirmation/views/config-confirmation-page', fallbackViewModel)
      expect(result).toBe(mockViewResponse)
    })

    test('should handle async errors in content loading', async () => {
      const testError = new Error('Async load error')
      const fallbackViewModel = { fallback: 'viewModel' }

      ConfirmationService.findFormBySlug.mockReturnValue(mockForm)
      ConfirmationService.loadConfirmationContent.mockRejectedValue(testError)
      ConfirmationService.buildViewModel.mockReturnValue(fallbackViewModel)

      const result = await demoConfirmationHandler(mockRequest, mockH)

      expect(mockLogger.error).toHaveBeenCalledWith('Demo confirmation route error', {
        error: 'Async load error'
      })
      expect(result).toBeDefined()
    })

    const slugVariations = [
      { slug: 'example-grant', description: 'example grant form' },
      { slug: 'flying-pigs', description: 'flying pigs form' },
      { slug: 'test-form-123', description: 'form with numbers' },
      { slug: 'form-with-dashes', description: 'form with dashes' }
    ]

    test.each(slugVariations)(
      'should handle slug "$slug" for $description',
      async ({ slug }) => {
        mockRequest.params.slug = slug
        const testForm = { id: 'test-id', slug, title: 'Test Form' }

        ConfirmationService.findFormBySlug.mockReturnValue(testForm)
        ConfirmationService.loadConfirmationContent.mockResolvedValue(mockConfirmationContent)
        ConfirmationService.buildViewModel.mockReturnValue({})

        await demoConfirmationHandler(mockRequest, mockH)

        expect(ConfirmationService.findFormBySlug).toHaveBeenCalledWith(slug)
        expect(ConfirmationService.buildViewModel).toHaveBeenCalledWith(
          expect.objectContaining({
            slug
          })
        )
      }
    )

    test('should handle missing request params', async () => {
      mockRequest.params = {}

      ConfirmationService.findFormBySlug.mockReturnValue(null)
      generateFormNotFoundResponse.mockReturnValue('not-found')

      const result = await demoConfirmationHandler(mockRequest, mockH)

      expect(ConfirmationService.findFormBySlug).toHaveBeenCalledWith(undefined)
      expect(generateFormNotFoundResponse).toHaveBeenCalledWith(undefined, mockH)
      expect(result).toBe('not-found')
    })
  })
})