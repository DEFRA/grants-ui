import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * Ensures only one active session exists per user. If an existing session is found
 * in the index for this contactId, it is dropped from the main cache before the new
 * session is stored. The index is then updated to point at the new sessionId.
 *
 * The guard `existingSessionId !== newSessionId` prevents a re-entrant sign-in from
 * evicting the very session it is about to create.
 *
 * @param {SessionCache} cache - main session cache (server.app.cache)
 * @param {UserSessionIndex} userSessionIndex - contactId→sessionId index (server.app.userSessionIndex)
 * @param {string} contactId - stable user identifier from the JWT payload
 * @param {string} newSessionId - UUID generated for the incoming sign-in
 * @returns {Promise<void>}
 */
export async function invalidatePreviousSession(cache, userSessionIndex, contactId, newSessionId) {
  const existingSessionId = /** @type {string | null} */ (await userSessionIndex.get(contactId))

  if (existingSessionId && existingSessionId !== newSessionId) {
    await cache.drop(existingSessionId)
    log(LogCodes.AUTH.SESSION_INVALIDATED, {
      userId: contactId,
      previousSessionId: existingSessionId,
      newSessionId
    })
  }

  await userSessionIndex.set(contactId, newSessionId)
}

/**
 * @typedef {{ get: (key: string) => Promise<unknown>, set: (key: string, value: unknown, ttl?: number) => Promise<void>, drop: (key: string) => Promise<void> }} SessionCache
 * @typedef {{ get: (key: string) => Promise<string | null>, set: (key: string, value: string, ttl?: number) => Promise<void>, drop: (key: string) => Promise<void> }} UserSessionIndex
 */
