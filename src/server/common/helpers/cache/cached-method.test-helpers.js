import { afterEach, beforeEach, vi } from 'vitest'
import Hapi from '@hapi/hapi'
import { Engine as CatboxMemory } from '@hapi/catbox-memory'
import { config } from '~/src/config/config.js'

/**
 * @param {...import('@hapi/hapi').Plugin<void> | { plugin: import('@hapi/hapi').Plugin<void> }} plugins
 */
export function useCachedMethodServer(...plugins) {
  /** @type {import('@hapi/hapi').Server} */
  let server
  beforeEach(async () => {
    server = Hapi.server({ cache: [{ name: config.get('session.cache.name'), engine: new CatboxMemory() }] })
    await server.register(plugins)
    await server.initialize()
  })
  afterEach(async () => {
    vi.useRealTimers()
    await server.stop()
  })
}
