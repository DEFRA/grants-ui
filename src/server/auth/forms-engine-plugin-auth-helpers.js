import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { whitelistService } from './services/whitelist.service.js'

export const formsAuthCallback = (request, _params, _definition) => {
  if (request.path.startsWith('/auth/')) {
    return
  }

  if (!request.path.endsWith('/start') && _definition?.metadata?.whitelistEnvVar) {
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

  const userCrn = request.auth.credentials?.crn || request.auth.credentials?.contactId
  const whitelistEnvVar = _definition?.metadata?.whitelistEnvVar
  if (userCrn && whitelistEnvVar) {
    const canAccess = whitelistService.isUserWhitelisted(userCrn, whitelistEnvVar)

    if (!canAccess) {
      log(LogCodes.AUTH.UNAUTHORIZED_ACCESS, {
        userId: userCrn,
        path: request.path,
        envVarName: whitelistEnvVar,
        reason: 'User failed whitelist check in forms callback',
        userAgent: request.headers?.['user-agent'] || 'server',
        referer: request.headers?.referer || 'none',
        message: `User failed whitelist check - redirecting to unauthorised page`
      })

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
}
