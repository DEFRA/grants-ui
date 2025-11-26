import { vi } from 'vitest'

vi.mock('~/src/config/config.js', () => ({
  config: {
    get: vi.fn().mockReturnValue('mocked')
  }
}))

vi.mock('../../common/forms/services/form.js', () => ({
  getFormsCache: vi.fn(() => [
    { slug: 'form-A', title: 'Form A' },
    { slug: 'form-B', title: 'Form B' }
  ])
}))

describe('dev-tools utils index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('should export generateFormNotFoundResponse', async () => {
    const { generateFormNotFoundResponse } = await import('./index.js')

    expect(generateFormNotFoundResponse).toBeDefined()
    expect(typeof generateFormNotFoundResponse).toBe('function')
  })

  test('should export getAllForms', async () => {
    const { getAllForms } = await import('./index.js')

    expect(getAllForms).toBeDefined()
    expect(typeof getAllForms).toBe('function')
  })

  test('should export getAvailableFormSlugs', async () => {
    const { getAvailableFormSlugs } = await import('./index.js')

    expect(getAvailableFormSlugs).toBeDefined()
    expect(typeof getAvailableFormSlugs).toBe('function')
  })

  test('should export buildDemoData', async () => {
    const { buildDemoData } = await import('./index.js')

    expect(buildDemoData).toBeDefined()
    expect(typeof buildDemoData).toBe('function')
  })

  test('should export all expected functions', async () => {
    const exports = await import('./index.js')

    const expectedExports = ['generateFormNotFoundResponse', 'getAllForms', 'getAvailableFormSlugs', 'buildDemoData']

    expectedExports.forEach((expectedExport) => {
      expect(exports).toHaveProperty(expectedExport)
      expect(typeof exports[expectedExport]).toBe('function')
    })
  })

  test('should not export any unexpected functions', async () => {
    const exports = await import('./index.js')
    const exportedKeys = Object.keys(exports)

    const expectedExports = ['generateFormNotFoundResponse', 'getAllForms', 'getAvailableFormSlugs', 'buildDemoData']

    expect(exportedKeys.sort()).toEqual(expectedExports.sort())
  })

  const expectedExports = [
    {
      name: 'generateFormNotFoundResponse',
      module: './generate-form-not-found-response.js'
    },
    {
      name: 'getAllForms',
      module: './get-all-forms.js'
    },
    {
      name: 'getAvailableFormSlugs',
      module: './get-available-form-slugs.js'
    },
    {
      name: 'buildDemoData',
      module: './build-demo-data.js'
    }
  ]

  test.each(expectedExports)('should correctly re-export $name from $module', async ({ name }) => {
    const exports = await import('./index.js')

    expect(exports[name]).toBeDefined()
    expect(typeof exports[name]).toBe('function')
  })
})
