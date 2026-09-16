import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@defra/forms-engine-plugin/shared.js', () => ({
  initAll: vi.fn(),
  initMaps: vi.fn()
}))

describe('#application', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete window.componentMapsEnabled
  })

  test('calls initAll on all components', async () => {
    await import('./application.js')
    const { initAll } = await import('@defra/forms-engine-plugin/shared.js')

    expect(initAll).toHaveBeenCalledTimes(1)
  })

  test('initialises maps when component maps are enabled', async () => {
    window.componentMapsEnabled = true

    await import('./application.js')
    const { initMaps } = await import('@defra/forms-engine-plugin/shared.js')

    expect(initMaps).toHaveBeenCalledWith({
      apiPath: '/api',
      assetPath: '/public/assets'
    })
  })

  test('does not initialise maps when component maps are disabled', async () => {
    window.componentMapsEnabled = false

    await import('./application.js')
    const { initMaps } = await import('@defra/forms-engine-plugin/shared.js')

    expect(initMaps).not.toHaveBeenCalled()
  })
})
