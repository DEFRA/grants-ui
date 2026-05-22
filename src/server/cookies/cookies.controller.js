import { context } from '~/src/config/nunjucks/context/context.js'
import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const GA_COOKIE_REGEX = /^_ga$|^_ga_.*$|^_gid$|^_gat_.*$|^_dc_gtm_.*$/

/**
 * Maps a consent cookie value to a boolean or undefined.
 * @param {unknown} value
 * @returns {boolean | undefined}
 */
const parseConsent = (value) => {
  if (value === 'true' || value === true) {
    return true
  }
  if (value === 'false' || value === false) {
    return false
  }
  return undefined
}

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
    const analyticsConsent = parseConsent(consentCookie)

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

    const cookieOptions = {
      ttl: expiryMs,
      isSecure,
      isHttpOnly: false,
      isSameSite: /** @type {'Lax'} */ ('Lax'),
      path: '/',
      encoding: /** @type {'none'} */ ('none')
    }

    // Async mode — return JSON for the XHR request from client-side JS
    if (isAsync) {
      const asyncResponse = h.response({ message: 'success' })
      asyncResponse.state(cookieName, consentValue, cookieOptions)
      return asyncResponse
    }

    // Synchronous mode from banner — redirect back to the original page
    if (isValidReturnUrl(returnUrl)) {
      const redirectResponse = h.redirect(returnUrl)
      redirectResponse.state(cookieName, consentValue, cookieOptions)
      return redirectResponse
    }

    // Synchronous mode from preferences page — re-render with success banner
    const ctx = await context(request)
    const analyticsConsent = parseConsent(consentValue)

    const response = h.view('cookies', {
      ...ctx,
      pageTitle: 'Cookies',
      heading: 'Cookies',
      referrer: '/',
      success: true,
      analyticsConsent
    })
    response.state(cookieName, consentValue, cookieOptions)
    return response
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
