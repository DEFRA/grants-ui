import { vi } from 'vitest'
import { devHomeHandler, generateToolsSection } from './dev-home.handler.js'
import { getAllForms } from '../utils/index.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('../utils/index.js')
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({}))

describe('dev-home.handler', () => {
  const mockAllForms = [
    { slug: 'example-grant-with-auth', title: 'Example Grant with Auth' },
    { slug: 'adding-value', title: 'Adding Value Grant' },
    { slug: 'flying-pigs', title: 'Flying Pigs Grant' }
  ]

  let mockRequest
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()
    getAllForms.mockReturnValue(mockAllForms)

    mockRequest = mockHapiRequest()
    mockH = mockHapiResponseToolkit()
  })

  test('should return HTML response with development tools page', () => {
    const mockHtmlResponse = { type: vi.fn().mockReturnValue('final-response') }
    mockH.response.mockReturnValue(mockHtmlResponse)

    const result = devHomeHandler(mockRequest, mockH)

    expect(getAllForms).toHaveBeenCalled()
    expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('<html>'))
    expect(mockHtmlResponse.type).toHaveBeenCalledWith('text/html')
    expect(result).toBe('final-response')
  })

  test('should include example forms in the response', () => {
    const mockHtmlResponse = { type: vi.fn().mockReturnValue('final-response') }
    mockH.response.mockReturnValue(mockHtmlResponse)

    devHomeHandler(mockRequest, mockH)

    const htmlContent = mockH.response.mock.calls[0][0]
    expect(htmlContent).toContain('Example Grant with Auth')
    expect(htmlContent).toContain('Adding Value Grant')
    expect(htmlContent).toContain('Flying Pigs Grant')
  })

  test('should handle empty forms list gracefully', () => {
    getAllForms.mockReturnValue([])

    const mockHtmlResponse = { type: vi.fn().mockReturnValue('final-response') }
    mockH.response.mockReturnValue(mockHtmlResponse)

    const result = devHomeHandler(mockRequest, mockH)

    expect(result).toBe('final-response')
    expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('Available Tools'))
  })

  test('should include error pages section in the response', () => {
    const mockHtmlResponse = { type: vi.fn().mockReturnValue('final-response') }
    mockH.response.mockReturnValue(mockHtmlResponse)

    devHomeHandler(mockRequest, mockH)

    const htmlContent = mockH.response.mock.calls[0][0]
    expect(htmlContent).toContain('Test Error Pages')
    expect(htmlContent).toContain('/dev/test-400')
    expect(htmlContent).toContain('/dev/test-429')
    expect(htmlContent).toContain('/dev/test-500')
  })
})

describe('generateToolsSection', () => {
  test('should not render examples section when tool has no examples', () => {
    const tools = [{ name: 'Tool', description: 'desc' }]
    const result = generateToolsSection(tools)
    expect(result).not.toContain('Example forms:')
  })
})
