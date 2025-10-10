import { vi } from 'vitest'

describe('dev-tools handlers index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('should export devHomeHandler', async () => {
    const { devHomeHandler } = await import('./index.js')

    expect(devHomeHandler).toBeDefined()
    expect(typeof devHomeHandler).toBe('function')
  }, 10000)

  test('should export demoConfirmationHandler', async () => {
    const { demoConfirmationHandler } = await import('./index.js')

    expect(demoConfirmationHandler).toBeDefined()
    expect(typeof demoConfirmationHandler).toBe('function')
  })

  test('should export all expected handlers', async () => {
    const exports = await import('./index.js')

    const expectedExports = ['devHomeHandler', 'demoConfirmationHandler']

    expectedExports.forEach((expectedExport) => {
      expect(exports).toHaveProperty(expectedExport)
      expect(typeof exports[expectedExport]).toBe('function')
    })
  })

  test('should not export any unexpected handlers', async () => {
    const exports = await import('./index.js')
    const exportedKeys = Object.keys(exports)

    const expectedExports = ['devHomeHandler', 'demoConfirmationHandler']

    expect(exportedKeys.sort()).toEqual(expectedExports.sort())
  })

  const expectedExports = [
    {
      name: 'devHomeHandler',
      module: './dev-home.handler.js'
    },
    {
      name: 'demoConfirmationHandler',
      module: './demo-confirmation.handler.js'
    }
  ]

  test.each(expectedExports)('should correctly re-export $name from $module', async ({ name }) => {
    const exports = await import('./index.js')

    expect(exports[name]).toBeDefined()
    expect(typeof exports[name]).toBe('function')
  })
})
