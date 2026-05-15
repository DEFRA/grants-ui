import { context } from '~/src/config/nunjucks/context/context.js'
import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const GA_COOKIE_REGEX = /^_ga$|^_ga_.*$|^_gid$|^_gat_.*$|^_dc_gtm_.*$/

/**
 * Removes Google Analytics cookies server-side using h.unstate().
 * This is essential for users with JavaScript disabled, where client-side
 * deletion never runs. Sends Set-Cookie headers with a past expiry date.
 * @param {import('@hapi/hapi').Request} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 */
const removeAnalytics = (request, h) => {
  for (const cookieName of Object.keys(request.state)) {
    if (GA_COOKIE_REGEX.test(cookieName)) {
      h.unstate(cookieName)
    }
  }
}

/**
 * Validates that a URL is safe for redirection (relative URLs only)
 * @param {string|string[]} url - The URL to validate
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
    const rawReturnUrl = request.query.returnUrl || '/'
    const returnUrl = isValidReturnUrl(rawReturnUrl) ? rawReturnUrl : '/'
    const success = request.query.success === 'true'
    log(LogCodes.COOKIES.PAGE_LOAD, { returnUrl, referer: request.headers.referer }, request)
    const ctx = await context(request)
    const cookieName = config.get('cookieConsent.cookieName')
    const consentCookie = request.state[cookieName]
    const analyticsConsent =
      consentCookie === 'true' || consentCookie === true
        ? true
        : consentCookie === 'false' || consentCookie === false
          ? false
          : undefined

    return h.view('cookies', {
      ...ctx,
      pageTitle: 'Cookies',
      heading: 'Cookies',
      referrer: returnUrl,
      success,
      analyticsConsent
    })
  }
}

/**
 * Controller for handling cookie preference updates
 * @satisfies {Partial<ServerRoute>}
 */
export const cookiesPostController = {
  async handler(request, h) {
    const payload = /** @type {Record<string, any> | undefined} */ (request.payload)
    const analytics = payload?.analytics
    const returnUrl = payload?.returnUrl
    const isAsync = payload?.async === true
    const cookieName = config.get('cookieConsent.cookieName')
    const expiryDays = config.get('cookieConsent.expiryDays')
    const acceptAnalytics = analytics === true || analytics === 'yes' || analytics === 'true'
    const consentValue = acceptAnalytics ? 'true' : 'false'
    const expiryMs = expiryDays * 24 * 60 * 60 * 1000

    const isSecure = config.get('env') === 'production'

    if (!acceptAnalytics) {
      removeAnalytics(request, h)
    }

    // Async mode — return JSON for the XHR request from client-side JS
    if (isAsync) {
      const response = h.response({ message: 'success' })
      response.state(cookieName, consentValue, {
        ttl: expiryMs,
        isSecure,
        isHttpOnly: false,
        isSameSite: 'Lax',
        path: '/',
        encoding: 'none'
      })
      return response
    }

    // Synchronous mode from banner — redirect back to the original page
    if (isValidReturnUrl(returnUrl)) {
      const response = h.redirect(returnUrl)
      response.state(cookieName, consentValue, {
        ttl: expiryMs,
        isSecure,
        isHttpOnly: false,
        isSameSite: 'Lax',
        path: '/',
        encoding: 'none'
      })
      return response
    }

    // Synchronous mode from preferences page — re-render with success banner
    const ctx = await context(request)
    const analyticsConsent = consentValue === 'true' ? true : consentValue === 'false' ? false : undefined

    const response = h.view('cookies', {
      ...ctx,
      pageTitle: 'Cookies',
      heading: 'Cookies',
      referrer: '/',
      success: true,
      analyticsConsent
    })
    response.state(cookieName, consentValue, {
      ttl: expiryMs,
      isSecure,
      isHttpOnly: false,
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
