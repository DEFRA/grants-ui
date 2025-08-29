import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

export const formsAuthCallback = (request, _params, _definition, _metadata) => {
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
}
