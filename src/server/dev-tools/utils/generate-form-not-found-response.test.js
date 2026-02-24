import { vi } from 'vitest'
import { generateFormNotFoundResponse } from './generate-form-not-found-response.js'
import { mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'
import { MOCK_FORM_CACHE_SUBSET } from '~/src/__test-fixtures__/mock-forms-cache.js'

vi.mock('../../common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => MOCK_FORM_CACHE_SUBSET)
}))

describe('generate-form-not-found-response', () => {
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()
    mockH = mockHapiResponseToolkit()
  })

  test('should generate error response with form list', () => {
    generateFormNotFoundResponse('invalid-slug', mockH)

    expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('Form slug "invalid-slug" not found'))
    expect(mockH.type).toHaveBeenCalledWith('text/html')
    expect(mockH.code).toHaveBeenCalledWith(404)
  })

  test('should include list of available forms', () => {
    generateFormNotFoundResponse('invalid-slug', mockH)

    const htmlContent = mockH.response.mock.calls[0][0]
    expect(htmlContent).toContain('• example-grant (Example Grant)')
    expect(htmlContent).toContain('• flying-pigs (Flying Pigs Grant)')
  })

  test('should use custom options when provided', () => {
    const options = {
      backLink: '/custom-back',
      title: 'Custom Title',
      errorMessage: 'Custom Error'
    }

    generateFormNotFoundResponse('invalid-slug', mockH, options)

    const htmlContent = mockH.response.mock.calls[0][0]
    expect(htmlContent).toContain('<title>Custom Title</title>')
    expect(htmlContent).toContain('⚠️ Custom Error')
    expect(htmlContent).toContain('<a href="/custom-back">← Back to Dev Tools</a>')
  })
})
