import { vi } from 'vitest'
import { generateFormNotFoundResponse } from './generate-form-not-found-response.js'
import { mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

describe('generate-form-not-found-response', () => {
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()
    mockH = mockHapiResponseToolkit()
  })

  test('should generate a 404 error response naming the slug', async () => {
    await generateFormNotFoundResponse('invalid-slug', mockH)

    expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('Form slug "invalid-slug" not found'))
    expect(mockH.type).toHaveBeenCalledWith('text/html')
    expect(mockH.code).toHaveBeenCalledWith(404)
  })

  test('should use custom options when provided', async () => {
    const options = {
      backLink: '/custom-back',
      title: 'Custom Title',
      errorMessage: 'Custom Error'
    }

    await generateFormNotFoundResponse('invalid-slug', mockH, options)

    const htmlContent = mockH.response.mock.calls[0][0]
    expect(htmlContent).toContain('<title>Custom Title</title>')
    expect(htmlContent).toContain('⚠️ Custom Error')
    expect(htmlContent).toContain('<a href="/custom-back">← Back to Dev Tools</a>')
  })
})
