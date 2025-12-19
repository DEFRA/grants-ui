import { vi } from 'vitest'
import {
  devHomeHandler,
  getFormsWithConfirmationContent,
  getFormsWithDetailsPage,
  buildToolsConfig,
  generateToolsSection
} from './dev-home.handler.js'
import { getAllForms } from '../utils/index.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('../utils/index.js')
vi.mock('~/src/server/common/helpers/logging/log.js', () => ({}))

describe('dev-home.handler', () => {
  const mockAllForms = [
    {
      slug: 'form-with-both',
      title: 'Form with Both',
      metadata: {
        confirmationContent: { html: '<p>Confirmation</p>' },
        detailsPage: { query: {} }
      }
    },
    {
      slug: 'form-with-confirmation-only',
      title: 'Form with Confirmation Only',
      metadata: {
        confirmationContent: { html: '<p>Confirmation</p>' }
      }
    },
    {
      slug: 'form-with-details-only',
      title: 'Form with Details Only',
      metadata: {
        detailsPage: { query: {} }
      }
    },
    {
      slug: 'form-with-neither',
      title: 'Form with Neither',
      metadata: {}
    },
    {
      slug: 'form-without-metadata',
      title: 'Form without Metadata'
    }
  ]

  let mockRequest
  let mockH

  beforeEach(() => {
    vi.clearAllMocks()
    getAllForms.mockReturnValue(mockAllForms)

    mockRequest = mockHapiRequest()
    mockH = mockHapiResponseToolkit()
  })

  describe('getFormsWithConfirmationContent', () => {
    test('should return only forms with confirmationContent in metadata', () => {
      const result = getFormsWithConfirmationContent()

      expect(result).toHaveLength(2)
      expect(result.map((f) => f.slug)).toEqual(['form-with-both', 'form-with-confirmation-only'])
    })

    test('should return empty array when no forms have confirmationContent', () => {
      getAllForms.mockReturnValue([{ slug: 'no-config', title: 'No Config', metadata: {} }])

      const result = getFormsWithConfirmationContent()

      expect(result).toHaveLength(0)
    })
  })

  describe('getFormsWithDetailsPage', () => {
    test('should return only forms with detailsPage in metadata', () => {
      const result = getFormsWithDetailsPage()

      expect(result).toHaveLength(2)
      expect(result.map((f) => f.slug)).toEqual(['form-with-both', 'form-with-details-only'])
    })

    test('should return empty array when no forms have detailsPage', () => {
      getAllForms.mockReturnValue([{ slug: 'no-config', title: 'No Config', metadata: {} }])

      const result = getFormsWithDetailsPage()

      expect(result).toHaveLength(0)
    })
  })

  describe('buildToolsConfig', () => {
    test('should build config with separate form arrays for each section', () => {
      const confirmationForms = [{ slug: 'conf-form', title: 'Conf Form' }]
      const detailsForms = [{ slug: 'details-form', title: 'Details Form' }]

      const result = buildToolsConfig({ confirmationForms, detailsForms })

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Demo Confirmation Pages')
      expect(result[0].examples).toHaveLength(1)
      expect(result[0].examples[0].slug).toBe('conf-form')
      expect(result[1].name).toBe('Demo Details Pages')
      expect(result[1].examples).toHaveLength(1)
      expect(result[1].examples[0].slug).toBe('details-form')
    })

    test('should handle empty form arrays', () => {
      const result = buildToolsConfig({ confirmationForms: [], detailsForms: [] })

      expect(result[0].examples).toHaveLength(0)
      expect(result[1].examples).toHaveLength(0)
    })
  })

  describe('generateToolsSection', () => {
    test('should render tool without examples section when examples is falsy', () => {
      const tools = [{ name: 'Test Tool', description: 'Test description' }]

      const result = generateToolsSection(tools)

      expect(result).toContain('Test Tool')
      expect(result).toContain('Test description')
      expect(result).not.toContain('Example forms:')
    })
  })

  describe('devHomeHandler', () => {
    test('should return HTML response with development tools page', () => {
      const mockHtmlResponse = { type: vi.fn().mockReturnValue('final-response') }
      mockH.response.mockReturnValue(mockHtmlResponse)

      const result = devHomeHandler(mockRequest, mockH)

      expect(getAllForms).toHaveBeenCalled()
      expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('<html>'))
      expect(mockHtmlResponse.type).toHaveBeenCalledWith('text/html')
      expect(result).toBe('final-response')
    })

    it.each([
      [
        'confirmation',
        '/dev/demo-confirmation',
        ['form-with-both', 'form-with-confirmation-only'],
        ['form-with-details-only', 'form-with-neither']
      ],
      [
        'details',
        '/dev/demo-details',
        ['form-with-both', 'form-with-details-only'],
        ['form-with-confirmation-only', 'form-with-neither']
      ]
    ])('should only show forms with %s config in %s section', (_name, basePath, included, excluded) => {
      const mockHtmlResponse = { type: vi.fn().mockReturnValue('final-response') }
      mockH.response.mockReturnValue(mockHtmlResponse)

      devHomeHandler(mockRequest, mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      included.forEach((slug) => expect(htmlContent).toContain(`${basePath}/${slug}`))
      excluded.forEach((slug) => expect(htmlContent).not.toContain(`${basePath}/${slug}`))
    })

    test('should handle empty forms list gracefully', () => {
      getAllForms.mockReturnValue([])

      const mockHtmlResponse = { type: vi.fn().mockReturnValue('final-response') }
      mockH.response.mockReturnValue(mockHtmlResponse)

      const result = devHomeHandler(mockRequest, mockH)

      expect(result).toBe('final-response')
      expect(mockH.response).toHaveBeenCalledWith(expect.stringContaining('Available Tools'))
    })
  })
})
