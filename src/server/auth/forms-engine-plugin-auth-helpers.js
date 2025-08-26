import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { whitelistService } from './services/whitelist.service.js'
import { sbiStore } from '~/src/server/sbi/state.js'

/**
 * Validate CRN against whitelist
 * @param {string} crn - The CRN to validate
 * @param {string} whitelistCrnEnvVar - Environment variable containing CRN whitelist
 * @returns {boolean} - True if validation passes or no validation required
 */
const validateCrnWhitelist = (crn, whitelistCrnEnvVar) => {
  if (!whitelistCrnEnvVar) {
    return true
  }
  return crn ? whitelistService.isCrnWhitelisted(crn, whitelistCrnEnvVar) : false
}

/**
 * Validate SBI against whitelist
 * @param {string} sbi - The SBI to validate
 * @param {string} whitelistSbiEnvVar - Environment variable containing SBI whitelist
 * @returns {boolean} - True if validation passes or no validation required
 */
const validateSbiWhitelist = (sbi, whitelistSbiEnvVar) => {
  if (!whitelistSbiEnvVar) {
    return true
  }
  return sbi ? whitelistService.isSbiWhitelisted(sbi, whitelistSbiEnvVar) : false
}

export const formsAuthCallback = (request, _params, _definition) => {
  if (request.path.startsWith('/auth/')) {
    return
  }

  if (
    !request.path.endsWith('/start') &&
    (_definition?.metadata?.whitelistCrnEnvVar || _definition?.metadata?.whitelistSbiEnvVar)
  ) {
    return
  }
  if (!request.auth.isAuthenticated) {
    log(LogCodes.AUTH.AUTH_DEBUG, {
      path: 'formsAuthCallback',
      isAuthenticated: request.auth.isAuthenticated,
      strategy: request.auth.strategy,
      mode: request.auth.mode,
      hasCredentials: !!request.auth.credentials,
      hasToken: false,
      hasProfile: false,
      userAgent: 'server',
      referer: 'none',
      queryParams: request.query || {}
    })

    const currentPath = request.url.pathname + request.url.search
    const redirectUrl = `/auth/sign-in?redirect=${encodeURIComponent(currentPath)}`
    const redirectError = new Error('Redirect')
    redirectError.output = {
      statusCode: statusCodes.redirect,
      payload: '',
      headers: {
        location: redirectUrl
      }
    }
    redirectError.isBoom = true

    throw redirectError
  }

  const crn = request.auth.credentials?.crn || request.auth.credentials?.contactId

  let sbi = null
  try {
    sbi = sbiStore.get('sbi')
  } catch (error) {
    log(LogCodes.AUTH.AUTH_DEBUG, {
      path: 'formsAuthCallback',
      error: `Failed to retrieve SBI from store: ${error.message}`,
      step: 'sbi_store_access_error'
    })
  }

  const whitelistCrnEnvVar = _definition?.metadata?.whitelistCrnEnvVar
  const whitelistSbiEnvVar = _definition?.metadata?.whitelistSbiEnvVar

  const crnPassesValidation = validateCrnWhitelist(crn, whitelistCrnEnvVar)
  const sbiPassesValidation = validateSbiWhitelist(sbi, whitelistSbiEnvVar)

  whitelistService.logWhitelistValidation({
    crn,
    sbi,
    path: request.path,
    crnPassesValidation,
    sbiPassesValidation,
    hasCrnValidation: !!whitelistCrnEnvVar,
    hasSbiValidation: !!whitelistSbiEnvVar
  })

  if (!crnPassesValidation || !sbiPassesValidation) {
    const unauthorisedError = new Error('Unauthorised')
    unauthorisedError.output = {
      statusCode: statusCodes.redirect,
      payload: '',
      headers: {
        location: '/auth/journey-unauthorised'
      }
    }
    unauthorisedError.isBoom = true

    throw unauthorisedError
  }
}
