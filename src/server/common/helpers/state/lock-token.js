import { config } from '~/src/config/config.js'
import jwt from 'jsonwebtoken'

/**
 * Mint an application-level lock token.
 *
 * This token is used to:
 * - Identify the user/session attempting to own a lock
 * - Prove the token was minted by grants-ui
 *
 * IMPORTANT:
 * - Token expiry is for security hygiene only (anti-replay)
 * - Lock lifetime is enforced exclusively by the backend
 *
 * @param {Object} params
 * @param {string} params.userId - DEFRA ID of the authenticated user
 * @param {string} params.sessionId - Frontend session identifier (browser-level)
 * @param {string} params.grantCode - Identifier of the grant code being locked
 * @returns {string} Signed JWT lock token
 */
export function mintLockToken({ userId, sessionId, grantCode }) {
  return jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      grantCode,
      typ: 'lock'
    },
    config.get('lockToken.secret'),
    {
      expiresIn: '5m',
      audience: 'grants-backend',
      issuer: 'grants-ui'
    }
  )
}
