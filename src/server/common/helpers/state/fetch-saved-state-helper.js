import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { parseSessionKey } from './get-cache-key-helper.js'
import { createApiHeaders } from './backend-auth-helper.js'
import { createLogger } from '../logging/logger.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

const logger = createLogger()

export async function fetchSavedStateFromApi(key) {
  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return null
  }

  const { userId, organisationId, grantId } = parseSessionKey(key.id)

  let json = null
  try {
    logger.debug(`Fetching saved state from backend for identity: ${key}`)

    const url = new URL('/state/', GRANTS_UI_BACKEND_ENDPOINT)
    url.searchParams.set('userId', userId)
    url.searchParams.set('businessId', organisationId)
    url.searchParams.set('grantId', grantId)

    const response = await fetch(url.href, {
      method: 'GET',
      headers: createApiHeaders()
    })

    if (!response.ok) {
      if (response.status === statusCodes.notFound) {
        logger.debug(`No state found in backend for identity: ${key}`)
        return null
      }
      throw new Error(`Failed to fetch saved state: ${response.status}`)
    }

    json = await response.json()

    if (!json || typeof json !== 'object') {
      logger.warn(`fetch-saved-state: Unexpected or empty state format: ${json}`)
      return null
    }
  } catch (err) {
    logger.error(`fetch-saved-state: Failed to fetch saved state from API: ${err}`)
    return null
  }

  return json
}
