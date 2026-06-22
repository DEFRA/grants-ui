import { config } from '~/src/config/config.js'
import jwt from 'jsonwebtoken'

/**
 * Mint an application-level lock token.
 *
 * This token is used to:
 * - Identify the user/session attempting to own a lock
 * - Prove the token was minted by grants-ui
 *
 * The `grantVersion` claim is optional: read lock tokens (e.g. the combined
 * `POST /state/with-definition` call) are minted before the active grant
 * version is known, so the backend validates them with `requireGrantVersion: false`.
 * When omitted, the claim is left out of the token entirely.
 *
 * @param {object} params
 * @param {string} params.userId - DEFRA ID of the authenticated user
 * @param {string} params.sbi - Single Business Identifier defining the lock scope
 * @param {string} params.grantCode - Identifier of the grant code being locked
 * @param {string | number} [params.grantVersion] - Version of the grant being locked (optional)
 * @returns {string} Signed JWT lock token
 */
export function mintLockToken({ userId, sbi, grantCode, grantVersion }) {
  /** @type {Record<string, unknown>} */
  const payload = {
    sub: userId,
    sbi,
    grantCode,
    typ: 'lock'
  }

  if (grantVersion !== undefined && grantVersion !== null) {
    payload.grantVersion = grantVersion
  }

  return jwt.sign(payload, config.get('applicationLock.secret'), {
    audience: 'grants-backend',
    issuer: 'grants-ui'
  })
}

/**
 * Mint a lock-release JWT for a given user
 *
 * @param {object} opts
 * @param {string} opts.ownerId - The user identifier
 * @param {number} [opts.ttlMs] - Optional token TTL in milliseconds (default: 1 min)
 * @returns {string} JWT
 */
export function mintLockReleaseToken({ ownerId, ttlMs = 60_000 }) {
  if (!ownerId) {
    throw new Error('ownerId is required to mint lock release token')
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: ownerId, // user ID
    typ: 'lock-release',
    iat: now,
    exp: now + Math.floor(ttlMs / 1000)
  }

  // Sign using the APPLICATION_LOCK_TOKEN_SECRET
  return jwt.sign(payload, config.get('applicationLock.secret'), {
    audience: 'grants-backend',
    issuer: 'grants-ui'
  })
}
