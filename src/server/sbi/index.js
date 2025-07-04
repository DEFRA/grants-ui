import { sbiSelectorController } from '~/src/server/sbi/sbi-selector.controller.js'
/**
 * Helper API to update sbi (for dev purposes).
 * These routes are registered in src/server/router.js.
 */

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const sbi = {
  plugin: {
    name: 'sbi',
    register(server) {
      server.route([
        {
          method: 'POST',
          path: '/api/update-sbi',
          options: {
            auth: false
          },
          ...sbiSelectorController
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
