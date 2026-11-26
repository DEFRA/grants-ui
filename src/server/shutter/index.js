import { log, LogCodes } from '../common/helpers/logging/log.js'
import { shutteredSlugs, shutterHandler } from './shutter.js'

export const shutter = {
  plugin: {
    name: 'shutter',

    /**
     * @param {Server} server
     */
    register: (server) => {
      const slugs = shutteredSlugs()
      if (slugs.length) {
        log(LogCodes.SYSTEM.GRANTS_SHUTTERED, { slugs })
      }
      server.ext('onPostAuth', shutterHandler)
    }
  }
}

/**
 * @import { Server } from '@hapi/hapi'
 */
