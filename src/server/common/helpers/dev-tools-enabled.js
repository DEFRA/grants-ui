import { config } from '~/src/config/config.js'

/**
 * Whether dev-only behaviour may run. `DEV_TOOLS_ENABLED` can be set
 * independently of `NODE_ENV`, keeps dev tooling out of a deployed environment.
 * @returns {boolean}
 */
export function isDevToolsEnabled() {
  return (
    config.get('devTools.enabled') === true &&
    process.env.NODE_ENV !== 'production' &&
    process.env.ENVIRONMENT === 'local'
  )
}
