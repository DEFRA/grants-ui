import { statusCodes } from '~/src/server/common/constants/status-codes.js'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const formsAuthCallback = (request, _params, _definition, _metadata) => {
  if (!request.auth.isAuthenticated) {
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
