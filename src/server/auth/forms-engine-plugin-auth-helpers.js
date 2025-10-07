import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { WhitelistServiceFactory } from './services/whitelist.service.js'

export const formsAuthCallback = (request, _params, _definition) => {
  if (request.path.startsWith('/auth/')) {
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
    /** @type {import('@hapi/boom').Boom} */
    // @ts-ignore
    const redirectError = new Error('Redirect')
    redirectError.output = {
      statusCode: statusCodes.redirect,
      // @ts-ignore
      payload: '',
      headers: {
        location: redirectUrl
      }
    }
    redirectError.isBoom = true

    throw redirectError
  }

  const crn = request.auth.credentials.crn
  const sbi = request.auth.credentials.sbi

  const whitelistService = WhitelistServiceFactory.getService(_definition)
  const validation = whitelistService.validateGrantAccess(crn, sbi)

  whitelistService.logWhitelistValidation({
    crn,
    sbi,
    path: request.path,
    crnPassesValidation: validation.crnPassesValidation,
    sbiPassesValidation: validation.sbiPassesValidation,
    hasCrnValidation: validation.hasCrnValidation,
    hasSbiValidation: validation.hasSbiValidation
  })

  if (!validation.overallAccess) {
    /** @type {import('@hapi/boom').Boom} */
    // @ts-ignore
    const unauthorisedError = new Error('Unauthorised')
    unauthorisedError.output = {
      statusCode: statusCodes.redirect,
      // @ts-ignore
      payload: '',
      headers: {
        location: '/auth/journey-unauthorised'
      }
    }
    unauthorisedError.isBoom = true

    throw unauthorisedError
  }
}
