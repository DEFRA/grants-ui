import { vi } from 'vitest'
import { generateFormNotFoundResponse } from './generate-form-not-found-response.js'
import { mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

const mockForms = [
  { id: 'form3', slug: 'example-grant', title: 'Example Grant', metadata: {} },
  { id: 'form4', slug: 'pigs-might-fly', title: 'Flying Pigs Grant', metadata: {} }
]

vi.mock('../../common/forms/services/forms-redis.js', () => ({
  getFormsRedisClient: vi.fn(() => ({})),
  getAllSlugs: vi.fn(),
  getFormMeta: vi.fn(),
  getAllFormMetas: vi.fn()
}))

describe('generate-form-not-found-response', () => {
  let mockH

  beforeEach(async () => {
    vi.clearAllMocks()
    mockH = mockHapiResponseToolkit()
    const formsRedis = await import('../../common/forms/services/forms-redis.js')
    formsRedis.getAllFormMetas.mockResolvedValue(mockForms)
  })

  test('should generate error response with form list', async () => {
    await generateFormNotFoundResponse('invalid-slug', mockH)

    expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('Form slug "invalid-slug" not found'))
    expect(mockH.type).toHaveBeenCalledWith('text/html')
    expect(mockH.code).toHaveBeenCalledWith(404)
  })

  test('should include list of available forms', async () => {
    await generateFormNotFoundResponse('invalid-slug', mockH)

    const htmlContent = mockH.response.mock.calls[0][0]
    expect(htmlContent).toContain('• example-grant (Example Grant)')
    expect(htmlContent).toContain('• pigs-might-fly (Flying Pigs Grant)')
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
