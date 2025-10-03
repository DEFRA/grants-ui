import { ComponentsRegistry } from './components.registry.js'

describe('ComponentsRegistry', () => {
  let originalComponents

  beforeEach(() => {
    originalComponents = new Map(ComponentsRegistry.components)
    ComponentsRegistry.components.clear()
  })

  afterEach(() => {
    ComponentsRegistry.components.clear()
    for (const [name, html] of originalComponents) {
      ComponentsRegistry.components.set(name, html)
    }
  })

  describe('register', () => {
    test('should register a component', () => {
      ComponentsRegistry.register('testComponent', '<div>Test HTML</div>')

      expect(ComponentsRegistry.components.get('testComponent')).toBe('<div>Test HTML</div>')
    })

    test('should register multiple components', () => {
      ComponentsRegistry.register('component1', '<div>HTML 1</div>')
      ComponentsRegistry.register('component2', '<div>HTML 2</div>')

      expect(ComponentsRegistry.components.get('component1')).toBe('<div>HTML 1</div>')
      expect(ComponentsRegistry.components.get('component2')).toBe('<div>HTML 2</div>')
      expect(ComponentsRegistry.components.size).toBe(2)
    })

    test('should overwrite existing component if registered again', () => {
      ComponentsRegistry.register('testComponent', '<div>Original</div>')
      ComponentsRegistry.register('testComponent', '<div>Updated</div>')

      expect(ComponentsRegistry.components.get('testComponent')).toBe('<div>Updated</div>')
      expect(ComponentsRegistry.components.size).toBe(1)
    })
  })

  describe('replaceComponents', () => {
    beforeEach(() => {
      ComponentsRegistry.register('testComponent', '<div>Test HTML</div>')
      ComponentsRegistry.register('anotherComponent', '<span>Another HTML</span>')
    })

    test('should replace component placeholders in content', () => {
      const content = 'Before {{TESTCOMPONENT}} and {{ANOTHERCOMPONENT}} after'
      const result = ComponentsRegistry.replaceComponents(content)

      expect(result).toBe('Before <div>Test HTML</div> and <span>Another HTML</span> after')
    })

    test('should handle multiple instances of same placeholder', () => {
      const content = '{{TESTCOMPONENT}} text {{TESTCOMPONENT}}'
      const result = ComponentsRegistry.replaceComponents(content)

      expect(result).toBe('<div>Test HTML</div> text <div>Test HTML</div>')
    })

    test('should handle content with no placeholders', () => {
      const content = 'This content has no placeholders'
      const result = ComponentsRegistry.replaceComponents(content)

      expect(result).toBe('This content has no placeholders')
    })

    test('should handle empty content', () => {
      const result = ComponentsRegistry.replaceComponents('')
      expect(result).toBe('')
    })

    test('should handle null content', () => {
      const result = ComponentsRegistry.replaceComponents(null)
      expect(result).toBeNull()
    })

    test('should handle undefined content', () => {
      const result = ComponentsRegistry.replaceComponents(undefined)
      expect(result).toBeUndefined()
    })

    test('should handle placeholders with special regex characters', () => {
      ComponentsRegistry.register('special.component', '<div>Special</div>')
      const content = '{{SPECIAL.COMPONENT}}'
      const result = ComponentsRegistry.replaceComponents(content)

      expect(result).toBe('<div>Special</div>')
    })

    test('should not replace placeholders for unregistered components', () => {
      const content = '{{UNREGISTERED}} component'
      const result = ComponentsRegistry.replaceComponents(content)

      expect(result).toBe('{{UNREGISTERED}} component')
    })

    test('should handle case-insensitive component names correctly', () => {
      ComponentsRegistry.register('mixedCase', '<div>Mixed</div>')
      const content = '{{MIXEDCASE}}'
      const result = ComponentsRegistry.replaceComponents(content)

      expect(result).toBe('<div>Mixed</div>')
    })
  })

  describe('defraSupportDetails component', () => {
    beforeEach(() => {
      ComponentsRegistry.components.clear()
      for (const [name, html] of originalComponents) {
        ComponentsRegistry.components.set(name, html)
      }
    })

    test('should have defraSupportDetails component registered by default', () => {
      const defraSupportDetails = ComponentsRegistry.components.get('defraSupportDetails')

      expect(defraSupportDetails).toBeDefined()
      expect(defraSupportDetails).toContain('govuk-details')
      expect(defraSupportDetails).toContain('If you have a question')
      expect(defraSupportDetails).toContain('03000 200 301')
      expect(defraSupportDetails).toContain('ruralpayments@defra.gov.uk')
    })

    test('should replace DEFRASUPPORTDETAILS placeholder', () => {
      const content = 'Some content {{DEFRASUPPORTDETAILS}} more content'
      const result = ComponentsRegistry.replaceComponents(content)

      expect(result).toContain('Some content')
      expect(result).toContain('govuk-details')
      expect(result).toContain('more content')
      expect(result).not.toContain('{{DEFRASUPPORTDETAILS}}')
    })
  })
})
