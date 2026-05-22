/**
 * @param {Server} server
 * @returns {StatePersistenceService}
 */
export function getFormsCacheService(server) {
  return /** @type {StatePersistenceService} */ (server.plugins['forms-engine-plugin'].cacheService)
}

/**
 * @import { Server } from '@hapi/hapi'
 * @import { StatePersistenceService } from '~/src/server/common/services/state-persistence/state-persistence.service.js'
 */
