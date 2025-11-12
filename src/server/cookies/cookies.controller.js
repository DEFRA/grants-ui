import { context } from '~/src/config/nunjucks/context/context.js'

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
    request.logger.info(`Cookies page: returnUrl = ${returnUrl}, referer = ${request.headers.referer}`)
    const ctx = await context(request)

    return h.view('cookies/views/cookies', {
      ...ctx,
      pageTitle: 'Cookies',
      heading: 'Cookies',
      referrer: returnUrl
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
    const returnUrl = payload?.returnUrl
    const redirectUrl = returnUrl?.startsWith('/') ? returnUrl : '/'

    return h.redirect(redirectUrl)
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
