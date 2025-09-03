import { createLogger } from '../logging/logger.js'
import { fetchSavedStateFromApi } from '../state/fetch-saved-state-helper.js'
import { persistStateToApi } from '../state/persist-state-helper.js'

const logger = createLogger()

// Custom Catbox client that uses backend API for storage
export class BackendCatboxClient {
  /**
   * Validate a Catbox cache segment name.
   * Must be a non-empty string with letters, numbers, underscores, or dashes.
   *
   * @param {string} segment
   * @throws {Error} If segment is invalid
   */
  validateSegmentName(segment) {
    if (!segment || typeof segment !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(segment)) {
      throw new Error('Invalid segment name: ' + segment)
    }
    return null
  }

  /**
   * Override the default get method to add logging
   * @param {string} key
   * @returns {Promise<CacheItem<T>|null>}
   */
  async get(key) {
    logger.debug(`backend-catbox-client: Cache GET - Key: ${JSON.stringify(key)}`)
    const state = await fetchSavedStateFromApi(key)
    logger.debug(`backend-catbox-client: Fetched State from API: ${JSON.stringify(state)}`)

    return {
      item: state ?? null
    }
  }

  /**
   * Override the default set method to add logging
   * @param {string} key
   * @param {T} value
   * @param {number} [ttl]
   * @returns {Promise<void>}
   */
  async set(key, value, ttl) {
    logger.debug(
      `backend-catbox-client: Cache SET - Value: ${JSON.stringify(value)}, Key: ${JSON.stringify(key)}, TTL: ${ttl}`
    )
    return persistStateToApi(value, key)
  }

  /**
   * Override the default drop method to add logging
   * @param {string} key
   * @returns {Promise<void>}
   */
  async drop(key) {
    // optional: no-op
    logger.debug(`backend-catbox-client: Cache DROP - Key: ${JSON.stringify(key)}`)
  }

  /**
   * Start the cache client.
   *
   * Called by Hapi/Catbox during server startup.
   * Can be a no-op if no initialization is required.
   *
   * @returns {Promise<void>}
   */
  async start() {
    logger.debug('backend-catbox-client: BackendCatboxClient start() called')
  }

  /**
   * Stop the cache client.
   *
   * Called by Hapi/Catbox during server shutdown.
   * Can be a no-op if no cleanup is required.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    logger.debug('backend-catbox-client: BackendCatboxClient stop() called')
  }

  /**
   * Checks whether the backend cache client is ready to handle operations.
   *
   * Catbox requires this method to determine if the client can be used.
   * Since this provider does not maintain a persistent connection,
   * it simply returns `true` to indicate readiness.
   *
   * @returns {boolean} Always returns `true` to satisfy Catbox interface.
   */
  isReady() {
    return true
  }
}
