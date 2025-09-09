import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

const SCENARIO_FLAGS = {
  HAS_CRN_VALIDATION: 8,
  HAS_SBI_VALIDATION: 4,
  CRN_PASSES: 2,
  SBI_PASSES: 1
}

class WhitelistService {
  /**
   * Check if a value is whitelisted based on environment variable
   * @param {string|number} value - The value to check
   * @param {string} envVarName - The environment variable name containing the whitelist
   * @returns {boolean}
   */
  isWhitelisted(value, envVarName) {
    if (!envVarName) {
      return true
    }

    const whitelistValue = process.env[envVarName]

    if (!whitelistValue || whitelistValue.trim() === '') {
      return false
    }

    const whitelist = whitelistValue
      .split(' ')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    const isWhitelisted = whitelist.includes(String(value))

    return isWhitelisted
  }

  /**
   * Check if a user is whitelisted based on environment variable
   * @param {string} crn - The user's CRN from DefraID
   * @param {string} envVarName - The environment variable name containing the whitelist
   * @returns {boolean}
   */
  isCrnWhitelisted(crn, envVarName) {
    return this.isWhitelisted(crn, envVarName)
  }

  /**
   * Check if an SBI is whitelisted based on environment variable
   * @param {string} sbi - The SBI number
   * @param {string} envVarName - The environment variable name containing the SBI whitelist
   * @returns {boolean}
   */
  isSbiWhitelisted(sbi, envVarName) {
    return this.isWhitelisted(sbi, envVarName)
  }

  /**
   * Validate grant access for CRN and SBI based on grant definition
   * @param {string} crn - The user's CRN from DefraID
   * @param {string} sbi - The SBI number
   * @param {object} grantDefinition - The grant definition containing metadata
   * @returns {object} Validation result object
   */
  validateGrantAccess(crn, sbi, grantDefinition) {
    const whitelistCrnEnvVar = grantDefinition?.metadata?.whitelistCrnEnvVar
    const whitelistSbiEnvVar = grantDefinition?.metadata?.whitelistSbiEnvVar

    const crnPassesValidation = this.isCrnWhitelisted(crn, whitelistCrnEnvVar)
    const sbiPassesValidation = this.isSbiWhitelisted(sbi, whitelistSbiEnvVar)

    return {
      crnPassesValidation,
      sbiPassesValidation,
      hasCrnValidation: !!whitelistCrnEnvVar,
      hasSbiValidation: !!whitelistSbiEnvVar,
      overallAccess: crnPassesValidation && sbiPassesValidation
    }
  }

  /**
   * Helper method to log whitelist events with consistent structure
   * @param {string} logCode - The log code to use
   * @param {string} crn - The user's CRN
   * @param {string} sbi - The SBI number
   * @param {string} path - The request path
   * @param {string} [validationType] - Optional validation type description
   */
  _logWhitelistEvent(logCode, crn, sbi, path, validationType) {
    const logData = {
      userId: crn,
      path,
      sbi
    }

    if (validationType) {
      logData.validationType = validationType
    }

    log(logCode, logData)
  }

  /**
   * Log whitelist validation results
   * @param {object} params - The logging parameters
   * @param {string} params.crn - The user's CRN
   * @param {string} params.sbi - The SBI number
   * @param {string} params.path - The request path
   * @param {boolean} params.crnPassesValidation - Whether CRN validation passed
   * @param {boolean} params.sbiPassesValidation - Whether SBI validation passed
   * @param {boolean} params.hasCrnValidation - Whether CRN validation is configured
   * @param {boolean} params.hasSbiValidation - Whether SBI validation is configured
   */
  logWhitelistValidation({
    crn,
    sbi,
    path,
    crnPassesValidation,
    sbiPassesValidation,
    hasCrnValidation,
    hasSbiValidation
  }) {
    const scenarioKey = this._calculateScenarioKey(
      hasCrnValidation,
      hasSbiValidation,
      crnPassesValidation,
      sbiPassesValidation
    )

    const scenario = this._getScenarioConfig(scenarioKey, crn, sbi)
    if (scenario) {
      this._logWhitelistEvent(scenario.logCode, scenario.userId, scenario.sbi, path, scenario.validationType)
    }
  }

  /**
   * Calculate scenario key based on validation flags
   * @private
   */
  _calculateScenarioKey(hasCrnValidation, hasSbiValidation, crnPassesValidation, sbiPassesValidation) {
    return (
      (hasCrnValidation ? SCENARIO_FLAGS.HAS_CRN_VALIDATION : 0) +
      (hasSbiValidation ? SCENARIO_FLAGS.HAS_SBI_VALIDATION : 0) +
      (crnPassesValidation ? SCENARIO_FLAGS.CRN_PASSES : 0) +
      (sbiPassesValidation ? SCENARIO_FLAGS.SBI_PASSES : 0)
    )
  }

  /**
   * Get scenario configuration based on key
   * @private
   */
  _getScenarioConfig(scenarioKey, crn, sbi) {
    const scenarios = {
      15: {
        logCode: LogCodes.AUTH.WHITELIST_ACCESS_GRANTED,
        userId: crn,
        sbi,
        validationType: 'Both CRN and SBI whitelist validation passed'
      },
      12: {
        logCode: LogCodes.AUTH.WHITELIST_ACCESS_DENIED_BOTH,
        userId: crn,
        sbi
      },
      14: {
        logCode: LogCodes.AUTH.WHITELIST_ACCESS_DENIED_CRN_PASSED,
        userId: crn,
        sbi
      },
      13: {
        logCode: LogCodes.AUTH.WHITELIST_ACCESS_DENIED_SBI_PASSED,
        userId: crn,
        sbi
      },
      10: {
        logCode: LogCodes.AUTH.WHITELIST_ACCESS_GRANTED,
        userId: crn,
        sbi: 'N/A',
        validationType: 'CRN whitelist validation passed (no SBI validation configured)'
      },
      5: {
        logCode: LogCodes.AUTH.WHITELIST_ACCESS_GRANTED,
        userId: 'N/A',
        sbi,
        validationType: 'SBI whitelist validation passed (no CRN validation configured)'
      }
    }

    return scenarios[scenarioKey]
  }
}

const whitelistService = new WhitelistService()

export { WhitelistService, whitelistService }
