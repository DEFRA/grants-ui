import { config } from '~/src/config/config.js'
import jwt from 'jsonwebtoken'

/**
 * Mint an application-level lock token.
 *
 * This token is used to:
 * - Identify the user/session attempting to own a lock
 * - Prove the token was minted by grants-ui
 *
 * @param {Object} params
 * @param {string} params.userId - DEFRA ID of the authenticated user
 * @param {string} params.sbi - Single Business Identifier defining the lock scope
 * @param {string} params.grantCode - Identifier of the grant code being locked
 * @param {number} params.grantVersion - Version of the grant being locked
 * @returns {string} Signed JWT lock token
 */
export function mintLockToken({ userId, sbi, grantCode, grantVersion = 1 }) {
  return jwt.sign(
    {
      sub: userId,
      sbi,
      grantCode,
      grantVersion,
      typ: 'lock'
    },
    config.get('applicationLock.secret'),
    {
      audience: 'grants-backend',
      issuer: 'grants-ui'
    }
  )
}
