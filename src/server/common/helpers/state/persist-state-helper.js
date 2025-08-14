import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { getCacheKey } from './get-cache-key-helper.js'
import { createApiHeaders } from './backend-auth-helper.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

export async function persistStateToApi(state, request) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return
  }

  const { userId, businessId, grantId } = getCacheKey(request)
  const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)

  request.logger.info(`Persisting state to backend for identity: ${userId}:${businessId}:${grantId}`)

  try {
    const response = await fetch(url.href, {
      method: 'POST',
      headers: createApiHeaders(),
      body: JSON.stringify({
        userId,
        businessId,
        grantId,
        grantVersion: 1, // TODO: Update when support for same grant versioning is implemented
        state
      })
    })

    if (!response.ok) {
      request.logger.error(`Failed to persist state to API: ${response.status} - ${response.statusText}`)
    }
  } catch (err) {
    request.logger.error(`Failed to persist state to API: ${err.message}`)

    // TODO: See TGC-781
    // throw err
  }
}
