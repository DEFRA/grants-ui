import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

/**
 * Validates backend authentication configuration
 * @param {Record<string, any>} config - The convict config object (callers in this repo annotate it as `SchemaObj<any>`, which is structurally a string-keyed bag — typing it tighter cascades into widespread breakage)
 * @throws {Error} When backend URL is set but auth credentials are incomplete
 * @returns {void}
 */
export function validateBackendAuthConfig(config) {
  const backendUrl = config.get('session.cache.apiEndpoint')
  const authToken = config.get('session.cache.authToken')
  const encryptionKey = config.get('session.cache.encryptionKey')

  if (backendUrl && (!authToken || !encryptionKey)) {
    const missingKeys = []
    if (!authToken) {
      missingKeys.push('GRANTS_UI_BACKEND_AUTH_TOKEN')
    }

    if (!encryptionKey) {
      missingKeys.push('GRANTS_UI_BACKEND_ENCRYPTION_KEY')
    }

    log(LogCodes.SYSTEM.BACKEND_AUTH_CONFIG_ERROR, { missingKeys })

    throw new Error(
      'Backend authentication configuration incomplete. ' +
        `When GRANTS_UI_BACKEND_URL is set, the following environment variables are required: ${missingKeys.join(', ')}`
    )
  }
}
