/**
 * Details page plugin.
 * Currently serves as a placeholder for future production routes.
 * The check-details.njk template is used by dev-tools for demo purposes.
 */

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const detailsPage = {
  plugin: {
    name: 'details-page',
    register() {
      // No routes registered yet - template is used by dev-tools
      // Production routes can be added here when needed
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
