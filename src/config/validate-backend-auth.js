/**
 * Validates backend authentication configuration
 * @param {object} config - The convict config object
 * @throws {Error} When backend URL is set but auth credentials are incomplete
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

    throw new Error(
      `Backend authentication configuration incomplete. ` +
        `When GRANTS_UI_BACKEND_URL is set, the following environment variables are required: ${missingKeys.join(', ')}`
    )
  }
}
