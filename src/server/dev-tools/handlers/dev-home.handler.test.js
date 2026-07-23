import { vi } from 'vitest'
import { devHomeHandler, buildToolsConfig, generateToolsSection } from './dev-home.handler.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('~/src/server/common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  debug: vi.fn()
}))

describe('dev-home.handler', () => {
  let mockRequest
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()

    mockRequest = mockHapiRequest()
    mockH = mockHapiResponseToolkit()
  })

  describe('buildToolsConfig', () => {
    test('should describe the slug-driven demo tools and the error pages tool', () => {
      const result = buildToolsConfig()

      expect(result).toHaveLength(4)
      expect(result[0].name).toBe('Demo Confirmation Pages')
      expect(result[0].pattern).toBe('/dev/demo-confirmation/{slug}')
      expect(result[0].examples).toBeUndefined()
      expect(result[1].name).toBe('Demo Details Pages')
      expect(result[1].pattern).toBe('/dev/demo-details/{slug}')
      expect(result[2].name).toBe('Demo Print Application')
      expect(result[2].pattern).toBe('/dev/demo-print-application/{slug}')
      expect(result[3].name).toBe('Test Error Pages')
      expect(result[3].examples.length).toBeGreaterThan(0)
    })
  })

  describe('generateToolsSection', () => {
    test('should render tool without examples but keep its pattern hint', () => {
      const tools = [{ name: 'Test Tool', description: 'Test description', pattern: '/dev/test/{slug}' }]

      const result = generateToolsSection(tools)

      expect(result).toContain('Test Tool')
      expect(result).toContain('Test description')
      expect(result).toContain('/dev/test/{slug}')
      expect(result).not.toContain('Example forms:')
    })
  })

  describe('devHomeHandler', () => {
    test('should return HTML response with development tools page', async () => {
      await devHomeHandler(mockRequest, mockH)

      expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('<html>'))
      expect(mockH.type).toHaveBeenCalledWith('text/html')
    })

    test('should include the demo tool patterns', async () => {
      await devHomeHandler(mockRequest, mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain('Available Tools')
      expect(htmlContent).toContain('/dev/demo-confirmation/{slug}')
      expect(htmlContent).toContain('/dev/demo-details/{slug}')
      expect(htmlContent).toContain('/dev/demo-print-application/{slug}')
    })
  })

  test('should include error pages section in the response', async () => {
    await devHomeHandler(mockRequest, mockH)

    const htmlContent = mockH.response.mock.calls[0][0]
    expect(htmlContent).toContain('Test Error Pages')
    expect(htmlContent).toContain('/dev/test-400')
    expect(htmlContent).toContain('/dev/test-429')
    expect(htmlContent).toContain('/dev/test-500')
  })
})
