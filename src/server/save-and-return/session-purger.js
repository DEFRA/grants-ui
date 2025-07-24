import { resilientFetch } from '~/src/server/common/helpers/resilient-fetch/resilient-fetch.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { GRANTS_UI_BACKEND_ENDPOINT } from '~/src/server/common/constants/grants-ui-backend.js'
import { getIdentity, keyGenerator } from '~/src/server/save-and-return/key-generator.js'

const deleteSessionFromMongoDb = async (request) => {
  const { userId, businessId, grantId } = getIdentity(request)
  const apiUrl = new URL(`${GRANTS_UI_BACKEND_ENDPOINT}/state/`)
  Object.entries({ userId, businessId, grantId }).forEach(([key, value]) => apiUrl.searchParams.append(key, value))

  request.logger.info(`Purging session from MongoDB for identity: ${userId}:${businessId}:${grantId}`)

  try {
    const response = await resilientFetch(apiUrl, {
      timeout: 10000,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok && response.status !== statusCodes.notFound) {
      throw new Error(`Failed to delete session from backend: ${response.status}`)
    }

    request.logger.info(`Session successfully purged from MongoDB for identity: ${userId}:${businessId}:${grantId}`)
    return true
  } catch (err) {
    if (err.name === 'AbortError') {
      request.logger.error(['session-purger'], 'MongoDB purge timed out after 10 seconds', err)
    } else {
      request.logger.error(['session-purger'], 'Failed to purge session from MongoDB', err)
    }
    return false
  }
}

const deleteSessionFromRedis = async (server, request) => {
  try {
    const cache = server.app.cache
    const sessionKey = keyGenerator(request)

    if (request.yar.id) {
      await cache.drop(sessionKey)
      request.logger.info(`SessionPurger: Redis cache cleared for key: ${sessionKey}`)
    } else {
      request.logger.warn('SessionPurger: No session ID available for Redis clearing')
    }

    return true
  } catch (redisErr) {
    request.logger.error(['session-purger'], 'SessionPurger: Failed to clear Redis cache', redisErr)
    return false
  }
}

export const sessionPurger = async (key, request, server) => {
  if (!GRANTS_UI_BACKEND_ENDPOINT) {
    request.logger.debug('SessionPurger: Backend not configured, using default clearState behavior')
    return
  }

  request.logger.info('SessionPurger: Starting session purge process')

  try {
    // Step 1: Clear MongoDB first
    const mongoSuccess = await deleteSessionFromMongoDb(request)
    if (!mongoSuccess) {
      request.logger.warn('SessionPurger: MongoDB purge failed, continuing with Redis clearing')
    }

    // Step 2: Clear Redis cache
    const redisSuccess = await deleteSessionFromRedis(server, request)

    const success = mongoSuccess && redisSuccess
    if (success) {
      request.logger.info('SessionPurger: Session purge completed successfully')
    } else {
      request.logger.warn('SessionPurger: Session purge completed with some failures')
    }

    return success
  } catch (err) {
    request.logger.error(['session-purger'], 'SessionPurger: Failed to purge session', err)
    throw err
  }
}
