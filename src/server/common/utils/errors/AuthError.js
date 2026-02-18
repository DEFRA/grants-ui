import { BaseError } from './BaseError.js'
import { LogCodes } from '../../helpers/logging/log-codes.js'

/**
 * @typedef {import('@hapi/hapi').Request} HapiRequest
 */

/**
 * Auth profile schema used in request auth credentials.
 * @typedef {{
 *   contactId?: string,
 *   currentRelationshipId?: string,
 *   [key: string]: any
 * }} AuthProfile
 */

/**
 * Credentials schema for `request.auth.credentials`.
 * @typedef {{
 *   profile?: AuthProfile,
 *   token?: string,
 *   refreshToken?: string,
 *   [key: string]: any
 * }} AuthCredentials
 */

/**
 * Hapi request that may contain auth credentials with the typed profile.
 * This merges the imported HapiRequest with a narrower `auth.credentials` shape.
 * @typedef {HapiRequest & { auth?: { credentials?: AuthCredentials } }} AuthRequest
 */

export class AuthError extends BaseError {
  logCode = LogCodes.AUTH.GENERIC_ERROR

  /**
   * Sends error details to the logger with additional details for Auth Errors
   * @param {AuthRequest|undefined} request
   * @param {...Record<string, any>} additionalDetail
   */
  log(request = undefined, ...additionalDetail) {
    const authLoggingData = this.getAuthLoggingData(request)
    super.log(request, Object.assign({}, ...additionalDetail, authLoggingData))
  }

  /**
   * Extracts authentication details from the request and adds them to the authLoggingData object for logging purposes
   * @param {AuthRequest|undefined} request
   * @return {Object}
   */
  getAuthLoggingData(request) {
    const authLoggingData = {}

    if (request?.auth?.credentials) {
      const { profile, refreshToken, token } = request.auth.credentials

      Object.assign(authLoggingData, {
        userId: profile ? profile.contactId : undefined,
        organisationId: profile ? profile.currentRelationshipId : undefined,
        profileData: {
          hasToken: !!token,
          hasRefreshToken: !!refreshToken,
          hasProfile: !!profile,
          profileKeys: Object.keys(profile || {}),
          tokenLength: token ? token.length : 0
        }
      })
    }

    return authLoggingData
  }
}
