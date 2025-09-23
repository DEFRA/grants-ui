import { vi } from 'vitest'
import { generateFormNotFoundResponse } from './generate-form-not-found-response.js'
import { mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

const mockFormCache = [
  { slug: 'example-grant', title: 'Example Grant' },
  { slug: 'adding-value', title: 'Adding Value Grant' },
  { slug: 'flying-pigs', title: 'Flying Pigs Grant' }
]

vi.mock('../../common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => mockFormCache)
}))

describe('generate-form-not-found-response', () => {
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()
    mockH = mockHapiResponseToolkit()
  })

  describe('generateFormNotFoundResponse', () => {
    test('should generate error response with default options', () => {
      const mockResponse = {
        type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
      }
      mockH.response.mockReturnValue(mockResponse)

      const result = generateFormNotFoundResponse('invalid-slug', mockH)

      expect(mockH.response).toHaveBeenCalledWith(
        expect.stringContaining('Form slug "invalid-slug" not found')
      )
      expect(mockResponse.type).toHaveBeenCalledWith('text/html')
      expect(mockResponse.type().code).toHaveBeenCalledWith(404)
      expect(result).toBe('final-response')
    })

    test('should include list of available forms', () => {
      const mockResponse = {
        type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
      }
      mockH.response.mockReturnValue(mockResponse)

      generateFormNotFoundResponse('invalid-slug', mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain('• example-grant (Example Grant)')
      expect(htmlContent).toContain('• adding-value (Adding Value Grant)')
      expect(htmlContent).toContain('• flying-pigs (Flying Pigs Grant)')
    })

    test('should use custom options when provided', () => {
      const options = {
        backLink: '/custom-back',
        title: 'Custom Title',
        errorMessage: 'Custom Error'
      }

      const mockResponse = {
        type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
      }
      mockH.response.mockReturnValue(mockResponse)

      generateFormNotFoundResponse('invalid-slug', mockH, options)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain('<title>Custom Title</title>')
      expect(htmlContent).toContain('⚠️ Custom Error')
      expect(htmlContent).toContain('<a href="/custom-back">← Back to Dev Tools</a>')
    })

    test('should handle special characters in slug', () => {
      const specialSlug = 'slug-with-<script>alert("xss")</script>'

      const mockResponse = {
        type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
      }
      mockH.response.mockReturnValue(mockResponse)

      generateFormNotFoundResponse(specialSlug, mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain(`Form slug "${specialSlug}" not found`)
    })

    test('should handle undefined slug', () => {
      const mockResponse = {
        type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
      }
      mockH.response.mockReturnValue(mockResponse)

      generateFormNotFoundResponse(undefined, mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain('Form slug "undefined" not found')
    })

    test('should handle null slug', () => {
      const mockResponse = {
        type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
      }
      mockH.response.mockReturnValue(mockResponse)

      generateFormNotFoundResponse(null, mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain('Form slug "null" not found')
    })

    const optionVariations = [
      {
        name: 'all custom options',
        options: {
          backLink: '/custom/back',
          title: 'Custom Error Page',
          errorMessage: 'Development Error'
        },
        expectedContains: ['Custom Error Page', 'Development Error', '/custom/back']
      },
      {
        name: 'partial custom options',
        options: {
          title: 'Partial Custom Title'
        },
        expectedContains: ['Partial Custom Title', 'Local Mode Error', '/dev']
      },
      {
        name: 'empty options object',
        options: {},
        expectedContains: ['Invalid Form Slug', 'Local Mode Error', '/dev']
      }
    ]

    test.each(optionVariations)(
      'should handle $name correctly',
      ({ options, expectedContains }) => {
        const mockResponse = {
          type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
        }
        mockH.response.mockReturnValue(mockResponse)

        generateFormNotFoundResponse('test-slug', mockH, options)

        const htmlContent = mockH.response.mock.calls[0][0]
        expectedContains.forEach(expectedText => {
          expect(htmlContent).toContain(expectedText)
        })
      }
    )

    test('should generate valid HTML structure', () => {
      const mockResponse = {
        type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
      }
      mockH.response.mockReturnValue(mockResponse)

      generateFormNotFoundResponse('test-slug', mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain('<html>')
      expect(htmlContent).toContain('<head>')
      expect(htmlContent).toContain('<title>')
      expect(htmlContent).toContain('<body')
      expect(htmlContent).toContain('</html>')
    })

    test('should include warning styling', () => {
      const mockResponse = {
        type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
      }
      mockH.response.mockReturnValue(mockResponse)

      generateFormNotFoundResponse('test-slug', mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain('background: #ffe6cc')
      expect(htmlContent).toContain('border-left: 4px solid #f47738')
    })

    test('should handle forms with special characters in titles', async () => {
      const mockFormCacheWithSpecialChars = [
        { slug: 'special-form', title: 'Form with "Quotes" & <Tags>' },
        { slug: 'unicode-form', title: 'Form with Ümlauts & Émojis 🎉' }
      ]

      const { getFormsCache } = await import('../../common/forms/services/form.js')
      getFormsCache.mockReturnValueOnce(mockFormCacheWithSpecialChars)

      const mockResponse = {
        type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
      }
      mockH.response.mockReturnValue(mockResponse)

      generateFormNotFoundResponse('test-slug', mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain('• special-form (Form with "Quotes" & <Tags>)')
      expect(htmlContent).toContain('• unicode-form (Form with Ümlauts & Émojis 🎉)')
    })

    const slugVariations = [
      { slug: 'simple-slug', description: 'simple slug' },
      { slug: 'slug_with_underscores', description: 'slug with underscores' },
      { slug: 'slug-with-dashes', description: 'slug with dashes' },
      { slug: '123-numeric-slug', description: 'numeric slug' },
      { slug: '', description: 'empty string slug' }
    ]

    test.each(slugVariations)(
      'should handle $description: "$slug"',
      ({ slug }) => {
        const mockResponse = {
          type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
        }
        mockH.response.mockReturnValue(mockResponse)

        const result = generateFormNotFoundResponse(slug, mockH)

        expect(mockH.response).toHaveBeenCalled()
        expect(mockResponse.type).toHaveBeenCalledWith('text/html')
        expect(result).toBe('final-response')

        const htmlContent = mockH.response.mock.calls[0][0]
        expect(htmlContent).toContain(`Form slug "${slug}" not found`)
      }
    )

    test('should handle empty forms cache', async () => {
      const { getFormsCache } = await import('../../common/forms/services/form.js')
      getFormsCache.mockReturnValueOnce([])

      const mockResponse = {
        type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
      }
      mockH.response.mockReturnValue(mockResponse)

      generateFormNotFoundResponse('test-slug', mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain('<h1>Available Forms</h1>')
      expect(htmlContent).toContain('<pre></pre>')
    })
  })
})