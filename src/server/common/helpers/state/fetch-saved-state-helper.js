import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { getCacheKey } from './get-cache-key-helper.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

export async function fetchSavedStateFromApi(request) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return null
  }
  const { userId, businessId, grantId } = getCacheKey(request)

  let json = null
  try {
    const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)
    url.searchParams.set('userId', userId)
    url.searchParams.set('businessId', businessId)
    url.searchParams.set('grantId', grantId)

    const response = await fetch(url.href, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === statusCodes.notFound) {
        return null
      }
      throw new Error(`Failed to fetch saved state: ${response.status}`)
    }

    json = await response.json()

    if (!json || typeof json !== 'object') {
      request.logger.warn(['fetch-saved-state'], 'Unexpected or empty state format', { json })
      return null
    }
  } catch (err) {
    request.logger.error(['fetch-saved-state'], 'Failed to fetch saved state from API', err)
    return null
  }

  return json
}
