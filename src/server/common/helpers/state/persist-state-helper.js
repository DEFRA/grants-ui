import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { getCacheKey } from './get-cache-key-helper.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

export async function persistStateToApi(state, request) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return
  }

  const { userId, businessId, grantId } = getCacheKey(request)
  const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)

  request.logger.info(
    ['session-persister'],
    `Persisting state to backend for identity: ${userId}:${businessId}:${grantId}`
  )

  try {
    const response = await fetch(url.href, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        businessId,
        grantId,
        state
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to persist state: ${response.status}`)
    }
  } catch (err) {
    request.logger.error(['session-persister'], 'Failed to persist state to API', err)
    throw err
  }
}
