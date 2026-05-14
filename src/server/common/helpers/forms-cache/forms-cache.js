/**
 * @param {Server} server
 * @returns {CacheService}
 */
export function getFormsCacheService(server) {
  return server.plugins['forms-engine-plugin'].cacheService
}

/**
 * @import { Server } from '@hapi/hapi'
 * @import { CacheService } from '@defra/forms-engine-plugin/cache-service.js'
 */
