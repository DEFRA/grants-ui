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

  test('should generate error response with form list', () => {
    const mockResponse = {
      type: vi.fn().mockReturnValue({ code: vi.fn().mockReturnValue('final-response') })
    }
    mockH.response.mockReturnValue(mockResponse)

    const result = generateFormNotFoundResponse('invalid-slug', mockH)

    expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('Form slug "invalid-slug" not found'))
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
})
