// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@defra/forms-engine-plugin/shared.js', () => ({
  initAll: vi.fn()
}))

vi.mock('./component-maps.js', () => ({
  initialiseComponentMaps: vi.fn()
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

  test('delegates enabled map setup to the shared initialiser', async () => {
    window.componentMapsEnabled = true

    await import('./application.js')
    const { initialiseComponentMaps } = await import('./component-maps.js')

    expect(initialiseComponentMaps).toHaveBeenCalledTimes(1)
  })

  test('delegates disabled map setup to the shared initialiser', async () => {
    window.componentMapsEnabled = false

    await import('./application.js')
    const { initialiseComponentMaps } = await import('./component-maps.js')

    expect(initialiseComponentMaps).toHaveBeenCalledTimes(1)
  })
})
