import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

class WhitelistService {
  /**
   * Check if a user is whitelisted based on environment variable
   * @param {string} userCrn - The user's CRN from DefraID
   * @param {string} envVarName - The environment variable name containing the whitelist
   * @returns {boolean}
   */
  isUserWhitelisted(userCrn, envVarName) {
    if (!envVarName) {
      return true
    }

    const whitelistValue = process.env[envVarName]

    if (!whitelistValue || whitelistValue.trim() === '') {
      log(LogCodes.AUTH.UNAUTHORIZED_ACCESS, {
        userId: userCrn,
        envVarName,
        reason: 'Whitelist environment variable not configured',
        message: `Access denied: CRN ${userCrn} attempted access but ${envVarName} is not configured`
      })
      return false
    }

    const whitelist = whitelistValue
      .split(' ')
      .map((crn) => crn.trim())
      .filter((crn) => crn.length > 0)

    const isWhitelisted = whitelist.includes(userCrn)

    if (!isWhitelisted) {
      log(LogCodes.AUTH.UNAUTHORIZED_ACCESS, {
        userId: userCrn,
        envVarName,
        reason: 'User CRN not in whitelist',
        whitelistSize: whitelist.length,
        message: `Access denied: CRN ${userCrn} attempted access but not in ${envVarName} whitelist`
      })
    }

    return isWhitelisted
  }
}

const whitelistService = new WhitelistService()

export { WhitelistService, whitelistService }
