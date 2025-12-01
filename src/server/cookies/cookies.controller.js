import { context } from '~/src/config/nunjucks/context/context.js'
import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * Validates that a URL is safe for redirection (relative URLs only)
 * @param {string} url - The URL to validate
 * @returns {boolean} True if the URL is a safe relative URL
 */
const isValidReturnUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return false
  }
  return url.startsWith('/') && !url.startsWith('//')
}

/**
 * Controller for the cookies page
 * Allows users to view cookie information and manage their consent preferences
 * @satisfies {Partial<ServerRoute>}
 */
export const cookiesController = {
  async handler(request, h) {
    const rawReturnUrl = request.query.returnUrl || request.headers.referer || '/'
    const returnUrl = isValidReturnUrl(rawReturnUrl) ? rawReturnUrl : '/'
    const success = request.query.success === 'true'
    log(LogCodes.COOKIES.PAGE_LOAD, { returnUrl, referer: request.headers.referer }, request)
    const ctx = await context(request)

    return h.view('cookies', {
      ...ctx,
      pageTitle: 'Cookies',
      heading: 'Cookies',
      referrer: returnUrl,
      success
    })
  }
}

/**
 * Controller for handling cookie preference updates
 * @satisfies {Partial<ServerRoute>}
 */
export const cookiesPostController = {
  handler(request, h) {
    const payload = /** @type {Record<string, any> | undefined} */ (request.payload)
    const analytics = payload?.analytics
    const returnUrl = payload?.returnUrl
    const cookieName = config.get('cookieConsent.cookieName')
    const expiryDays = config.get('cookieConsent.expiryDays')
    const consentValue = analytics === 'yes' ? 'true' : 'false'
    const expiryMs = expiryDays * 24 * 60 * 60 * 1000

    let redirectUrl
    if (returnUrl?.startsWith('/cookies')) {
      redirectUrl = '/cookies?success=true'
    } else if (isValidReturnUrl(returnUrl)) {
      redirectUrl = returnUrl
    } else {
      redirectUrl = '/'
    }

    const response = h.redirect(redirectUrl)
    response.state(cookieName, consentValue, {
      ttl: expiryMs,
      isSecure: config.get('env') === 'production',
      isHttpOnly: false, // Cookie needs to be readable by client-side JavaScript
      isSameSite: 'Lax',
      path: '/',
      encoding: 'none'
    })

    return response
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
