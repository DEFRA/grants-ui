import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { parseSessionKey } from './get-cache-key-helper.js'
import { createApiHeaders } from './backend-auth-helper.js'
import { createLogger } from '../logging/logger.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

const logger = createLogger()

export async function persistStateToApi(state, key) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return
  }

  const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)

  const { userId, organisationId, grantId } = parseSessionKey(key.id)

  logger.debug(`Persisting state to backend for identity: ${key.userId}:${key.organisationId}:${key.grantId}`)

  try {
    const response = await fetch(url.href, {
      method: 'POST',
      headers: createApiHeaders(),
      body: JSON.stringify({
        userId,
        businessId: organisationId,
        grantId,
        grantVersion: 1, // TODO: Update when support for same grant versioning is implemented
        state
      })
    })

    if (!response.ok) {
      logger.error(`Failed to persist state to API: ${response.status} - ${response.statusText}`)
    }
  } catch (err) {
    logger.error(`Failed to persist state to API: ${err.message}`)

    // TODO: See TGC-781
    // throw err
  }
}
