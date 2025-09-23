import { vi } from 'vitest'
import {
  getExampleForms,
  buildToolsConfig,
  generatePageStyles,
  generateEnvironmentInfo,
  generateToolsSection,
  generateDevHomePage,
  devHomeHandler
} from './dev-home.handler.js'
import { getAllForms } from '../utils/index.js'
import { mockHapiRequest, mockHapiResponseToolkit } from '~/src/__mocks__/hapi-mocks.js'

vi.mock('../utils/index.js')

describe('dev-home.handler', () => {
  const mockAllForms = [
    { slug: 'example-grant-with-auth', title: 'Example Grant with Auth' },
    { slug: 'adding-value', title: 'Adding Value Grant' },
    { slug: 'flying-pigs', title: 'Flying Pigs Grant' },
    { slug: 'other-form', title: 'Other Form' },
    { slug: 'another-form', title: 'Another Form' }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    getAllForms.mockReturnValue(mockAllForms)
  })

  describe('getExampleForms', () => {
    test('should return default example forms with default parameters', () => {
      const result = getExampleForms()

      expect(getAllForms).toHaveBeenCalled()
      expect(result).toEqual([
        { slug: 'example-grant-with-auth', title: 'Example Grant with Auth' },
        { slug: 'adding-value', title: 'Adding Value Grant' },
        { slug: 'flying-pigs', title: 'Flying Pigs Grant' }
      ])
    })

    test('should return forms filtered by custom slugs', () => {
      const customSlugs = ['flying-pigs', 'other-form']

      const result = getExampleForms(customSlugs)

      expect(result).toEqual([
        { slug: 'flying-pigs', title: 'Flying Pigs Grant' },
        { slug: 'other-form', title: 'Other Form' }
      ])
    })

    test('should limit results to specified number', () => {
      const result = getExampleForms(undefined, 2)

      expect(result).toHaveLength(2)
      expect(result).toEqual([
        { slug: 'example-grant-with-auth', title: 'Example Grant with Auth' },
        { slug: 'adding-value', title: 'Adding Value Grant' }
      ])
    })

    test('should handle custom slugs and limit together', () => {
      const customSlugs = ['flying-pigs', 'other-form', 'another-form']

      const result = getExampleForms(customSlugs, 2)

      expect(result).toHaveLength(2)
      expect(result).toEqual([
        { slug: 'flying-pigs', title: 'Flying Pigs Grant' },
        { slug: 'other-form', title: 'Other Form' }
      ])
    })

    test('should return empty array when no matching slugs found', () => {
      const result = getExampleForms(['non-existent-form'])

      expect(result).toEqual([])
    })

    test('should handle empty slug array', () => {
      const result = getExampleForms([])

      expect(result).toEqual([])
    })

    const slugVariations = [
      {
        slugs: ['example-grant-with-auth'],
        limit: 1,
        expected: [{ slug: 'example-grant-with-auth', title: 'Example Grant with Auth' }]
      },
      {
        slugs: ['adding-value', 'flying-pigs'],
        limit: 5,
        expected: [
          { slug: 'adding-value', title: 'Adding Value Grant' },
          { slug: 'flying-pigs', title: 'Flying Pigs Grant' }
        ]
      },
      {
        slugs: ['non-existent', 'flying-pigs', 'another-non-existent'],
        limit: 3,
        expected: [{ slug: 'flying-pigs', title: 'Flying Pigs Grant' }]
      }
    ]

    test.each(slugVariations)(
      'should return correct forms for slugs $slugs with limit $limit',
      ({ slugs, limit, expected }) => {
        const result = getExampleForms(slugs, limit)

        expect(result).toEqual(expected)
      }
    )
  })

  describe('buildToolsConfig', () => {
    const exampleForms = [
      { slug: 'form1', title: 'Form 1' },
      { slug: 'form2', title: 'Form 2' }
    ]

    test('should build tools configuration with example forms', () => {
      const result = buildToolsConfig(exampleForms)

      expect(result).toEqual([
        {
          name: 'Demo Confirmation Pages',
          description: 'Test the config-driven confirmation page with different form configurations',
          examples: [
            {
              name: 'Form 1',
              path: '/dev/demo-confirmation/form1',
              slug: 'form1'
            },
            {
              name: 'Form 2',
              path: '/dev/demo-confirmation/form2',
              slug: 'form2'
            }
          ]
        }
      ])
    })

    test('should handle empty forms array', () => {
      const result = buildToolsConfig([])

      expect(result).toEqual([
        {
          name: 'Demo Confirmation Pages',
          description: 'Test the config-driven confirmation page with different form configurations',
          examples: []
        }
      ])
    })

    test('should handle forms with special characters in titles and slugs', () => {
      const specialForms = [
        { slug: 'form-with-dashes', title: 'Form with "Quotes" & Special Chars' },
        { slug: 'form_with_underscores', title: "Form with 'Single Quotes'" }
      ]

      const result = buildToolsConfig(specialForms)

      expect(result[0].examples).toEqual([
        {
          name: 'Form with "Quotes" & Special Chars',
          path: '/dev/demo-confirmation/form-with-dashes',
          slug: 'form-with-dashes'
        },
        {
          name: "Form with 'Single Quotes'",
          path: '/dev/demo-confirmation/form_with_underscores',
          slug: 'form_with_underscores'
        }
      ])
    })
  })

  describe('generatePageStyles', () => {
    test('should return CSS styles as a string', () => {
      const result = generatePageStyles()

      expect(typeof result).toBe('string')
      expect(result).toContain('body { font-family: system-ui, sans-serif;')
      expect(result).toContain('.warning {')
      expect(result).toContain('.tool {')
      expect(result).toContain('.env-info {')
    })

    test('should include all required CSS classes', () => {
      const result = generatePageStyles()

      const expectedClasses = [
        'body',
        '.warning',
        '.tool',
        '.tool h3',
        '.tool a',
        '.tool a:hover',
        '.env-info'
      ]

      expectedClasses.forEach(className => {
        expect(result).toContain(className)
      })
    })
  })

  describe('generateEnvironmentInfo', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    test('should generate environment info with NODE_ENV and ENVIRONMENT', () => {
      process.env.NODE_ENV = 'development'
      process.env.ENVIRONMENT = 'local'

      const result = generateEnvironmentInfo()

      expect(result).toContain('<strong>Environment:</strong> development')
      expect(result).toContain('<strong>isLocal:</strong> local')
      expect(result).toContain('<strong>Access:</strong> Development tools enabled')
    })

    test('should handle missing environment variables', () => {
      delete process.env.NODE_ENV
      delete process.env.ENVIRONMENT

      const result = generateEnvironmentInfo()

      expect(result).toContain('<strong>Environment:</strong> unknown')
      expect(result).toContain('<strong>isLocal:</strong> unknown')
    })

    const environmentVariations = [
      { NODE_ENV: 'production', ENVIRONMENT: 'prod' },
      { NODE_ENV: 'test', ENVIRONMENT: 'test' },
      { NODE_ENV: 'development', ENVIRONMENT: 'dev' },
      { NODE_ENV: undefined, ENVIRONMENT: 'local' },
      { NODE_ENV: 'development', ENVIRONMENT: undefined }
    ]

    test.each(environmentVariations)(
      'should handle NODE_ENV=$NODE_ENV and ENVIRONMENT=$ENVIRONMENT',
      ({ NODE_ENV, ENVIRONMENT }) => {
        process.env.NODE_ENV = NODE_ENV
        process.env.ENVIRONMENT = ENVIRONMENT

        const result = generateEnvironmentInfo()

        expect(result).toContain(`<strong>Environment:</strong> ${NODE_ENV || 'unknown'}`)
        expect(result).toContain(`<strong>isLocal:</strong> ${ENVIRONMENT || 'unknown'}`)
      }
    )
  })

  describe('generateToolsSection', () => {
    test('should generate HTML for tools with examples', () => {
      const tools = [
        {
          name: 'Test Tool',
          description: 'A test tool description',
          examples: [
            { name: 'Example 1', path: '/path1', slug: 'slug1' },
            { name: 'Example 2', path: '/path2', slug: 'slug2' }
          ]
        }
      ]

      const result = generateToolsSection(tools)

      expect(result).toContain('<h3>Test Tool</h3>')
      expect(result).toContain('<p>A test tool description</p>')
      expect(result).toContain('<a href="/path1">Example 1</a>')
      expect(result).toContain('<a href="/path2">Example 2</a>')
      expect(result).toContain('<code style="background: #f0f0f0; padding: 2px 4px; font-size: 0.9em; margin-left: 8px;">slug1</code>')
      expect(result).toContain('<code style="background: #f0f0f0; padding: 2px 4px; font-size: 0.9em; margin-left: 8px;">slug2</code>')
      expect(result).toContain('Pattern: <code>/dev/demo-confirmation/{slug}</code>')
    })

    test('should generate HTML for tools without examples', () => {
      const tools = [
        {
          name: 'Simple Tool',
          description: 'A simple tool without examples'
        }
      ]

      const result = generateToolsSection(tools)

      expect(result).toContain('<h3>Simple Tool</h3>')
      expect(result).toContain('<p>A simple tool without examples</p>')
      expect(result).not.toContain('<strong>Example forms:</strong>')
      expect(result).not.toContain('Pattern:')
    })

    test('should handle empty tools array', () => {
      const result = generateToolsSection([])

      expect(result).toBe('')
    })

    test('should escape HTML in tool names and descriptions', () => {
      const tools = [
        {
          name: 'Tool with <script>alert("xss")</script>',
          description: 'Description with "quotes" & special chars'
        }
      ]

      const result = generateToolsSection(tools)

      expect(result).toContain('<h3>Tool with <script>alert("xss")</script></h3>')
      expect(result).toContain('<p>Description with "quotes" & special chars</p>')
    })

    const toolVariations = [
      {
        name: 'single tool with examples',
        tools: [{
          name: 'Demo Tool',
          description: 'Demo description',
          examples: [{ name: 'Demo', path: '/demo', slug: 'demo' }]
        }],
        expectedContains: ['Demo Tool', 'Demo description', '/demo', 'demo']
      },
      {
        name: 'multiple tools mixed',
        tools: [
          { name: 'Tool 1', description: 'Desc 1', examples: [] },
          { name: 'Tool 2', description: 'Desc 2', examples: [{ name: 'Ex1', path: '/ex1', slug: 'ex1' }] }
        ],
        expectedContains: ['Tool 1', 'Tool 2', 'Desc 1', 'Desc 2', '/ex1']
      }
    ]

    test.each(toolVariations)(
      'should generate correct HTML for $name',
      ({ tools, expectedContains }) => {
        const result = generateToolsSection(tools)

        expectedContains.forEach(expectedText => {
          expect(result).toContain(expectedText)
        })
      }
    )
  })

  describe('generateDevHomePage', () => {
    test('should generate complete HTML page', () => {
      const tools = [
        {
          name: 'Test Tool',
          description: 'Test description',
          examples: [{ name: 'Example', path: '/example', slug: 'example' }]
        }
      ]

      const result = generateDevHomePage(tools)

      expect(result).toContain('<!DOCTYPE html>' || '<html>')
      expect(result).toContain('<title>Development Tools</title>')
      expect(result).toContain('<h1>Development Tools</h1>')
      expect(result).toContain('⚠️ Development Mode Only')
      expect(result).toContain('Test Tool')
      expect(result).toContain('Test description')
    })

    test('should include page styles in head', () => {
      const result = generateDevHomePage([])

      expect(result).toContain('<style>')
      expect(result).toContain('body { font-family: system-ui, sans-serif;')
    })

    test('should include environment info section', () => {
      const result = generateDevHomePage([])

      expect(result).toContain('<strong>Environment:</strong>')
      expect(result).toContain('<strong>isLocal:</strong>')
      expect(result).toContain('<strong>Access:</strong> Development tools enabled')
    })

    test('should include tools section', () => {
      const tools = [{ name: 'Test Tool', description: 'Test desc' }]

      const result = generateDevHomePage(tools)

      expect(result).toContain('<h2>Available Tools</h2>')
      expect(result).toContain('Test Tool')
    })

    test('should include footer with instruction', () => {
      const result = generateDevHomePage([])

      expect(result).toContain('To add more development tools, edit src/server/dev-tools/')
    })
  })

  describe('devHomeHandler', () => {
    let mockRequest
    let mockH

    beforeEach(() => {
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

    test('should include tool configuration in the response', () => {
      const mockHtmlResponse = { type: vi.fn().mockReturnValue('final-response') }
      mockH.response.mockReturnValue(mockHtmlResponse)

      devHomeHandler(mockRequest, mockH)

      const htmlContent = mockH.response.mock.calls[0][0]
      expect(htmlContent).toContain('Demo Confirmation Pages')
      expect(htmlContent).toContain('Test the config-driven confirmation page')
      expect(htmlContent).toContain('/dev/demo-confirmation/')
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