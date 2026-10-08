import { multiApplicationRedirect } from '../../request-pipeline/redirects/multi-application-redirect.js'
import { REDIRECTION_MAX, REDIRECTION_MIN } from '../../request-pipeline/redirects/service-root-redirect.js'
import { getReferenceNumber, REFERENCE_NUMBER_PATTERN, withReferenceNumber } from '../state/get-cache-key-helper.js'

// The plugin's registered name: Hapi records it on every route the plugin registers.
const FORMS_ENGINE_PLUGIN_NAME = '@defra/forms-engine-plugin'

/**
 * Keeps `?ref=` attached to every request of a journey. The forms-engine-plugin
 * strips query strings (hidden-field prefill on GET, `proceed()` on POST) and
 * renders plain-path links, so: `onPreHandler` hides the ref from it on
 * `request.app`, and two `onPreResponse` hooks put it back on redirects and links.
 */
export default {
  plugin: {
    name: 'multi-application',
    register: (server) => {
      // 1. Route the request: validate ?ref=, or pick 0/1/many -> start / continue / selector.
      server.ext('onPostAuth', (request, h) => multiApplicationHandler(request, h))
      // 2. Move ref from request.query to request.app so the forms engine never strips it.
      server.ext('onPreHandler', (request, h) => hideReferenceNumberFromFormsEngine(request, h))
      // 3. Put ?ref= back on every same-grant redirect (the plugin drops query params on POST).
      server.ext('onPreResponse', (request, h) => reattachReferenceNumber(request, h))
      // 4. Put ?ref= on every same-grant link of the rendered page; after the dev journey runner,
      //    which also wraps the view's render.
      server.ext('onPreResponse', (request, h) => reattachReferenceNumberToRenderedLinks(request, h), {
        after: ['journey-runner']
      })
    }
  }
}

/**
 * @param {Request} request
 * @returns {boolean}
 */
const isFormsEngineRoute = (request) => request.route?.realm?.plugin === FORMS_ENGINE_PLUGIN_NAME

/**
 * Moves `ref` off `request.query` onto `request.app.referenceNumber` for
 * forms-engine routes, so the plugin never sees a query to strip.
 *
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {symbol}
 */
const hideReferenceNumberFromFormsEngine = (request, h) => {
  if (!isFormsEngineRoute(request)) {
    return h.continue
  }

  const { ref, ...queryWithoutRef } = request.query ?? {}

  // Same validation as reading it from the query: a malformed ref is never stashed.
  if (typeof ref !== 'string' || !REFERENCE_NUMBER_PATTERN.test(ref)) {
    return h.continue
  }

  // `query` is typed read-only but is a plain property at runtime.
  const mutableRequest = /** @type {{ query: Record<string, unknown>, app: { referenceNumber?: string } }} */ (
    /** @type {unknown} */ (request)
  )
  mutableRequest.app ??= {}
  mutableRequest.app.referenceNumber = ref
  mutableRequest.query = queryWithoutRef

  return h.continue
}

/**
 * Relative and inside this grant (`//` would be protocol-relative).
 *
 * @param {string} slug
 * @param {string} location
 * @returns {boolean}
 */
const staysInJourney = (slug, location) => location.startsWith(`/${slug}/`) || location === `/${slug}`

/**
 * Puts `?ref=` back on every same-grant redirect, the plugin's own included.
 * Anything leaving the journey (sign-out, agreements, another grant) is left alone.
 *
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {symbol}
 */
const reattachReferenceNumber = (request, h) => {
  const ref = getReferenceNumber(request)
  const slug = request.params?.slug
  const response = /** @type {{ statusCode?: number, headers?: Record<string, string> }} */ (request.response)
  const headers = response?.headers
  const location = headers?.location

  const isRedirect =
    typeof response?.statusCode === 'number' &&
    response.statusCode >= REDIRECTION_MIN &&
    response.statusCode <= REDIRECTION_MAX

  if (!ref || !slug || !isRedirect || !headers || typeof location !== 'string') {
    return h.continue
  }

  if (!staysInJourney(slug, location)) {
    return h.continue
  }

  headers.location = withReferenceNumber(request, location)

  return h.continue
}

/** Every `href`/`action` attribute: 1 attribute name, 2 quote, 3 value. */
const LINK_ATTRIBUTE_PATTERN = /(href|action)=(["'])([^"']*)\2/g

/**
 * Resolves the link against the page it is on (as the browser would) and
 * checks it stays inside this grant. Bare fragments never leave the page.
 *
 * @param {string} slug
 * @param {URL} pageUrl
 * @param {string} link - HTML-unescaped attribute value
 * @returns {boolean}
 */
const isSameGrantLink = (slug, pageUrl, link) => {
  if (!link || link.startsWith('#')) {
    return false
  }

  try {
    const resolved = new URL(link, pageUrl)

    return resolved.origin === pageUrl.origin && staysInJourney(slug, resolved.pathname)
  } catch {
    // Unparsable (e.g. user-entered) link: left as it is rather than failing the page.
    return false
  }
}

/**
 * @param {Request} request
 * @param {string} slug
 * @param {string} html
 * @returns {string}
 */
const rewriteLinks = (request, slug, html) =>
  html.replace(LINK_ATTRIBUTE_PATTERN, (match, attr, quote, url) => {
    const unescaped = url.replaceAll('&amp;', '&')

    if (!isSameGrantLink(slug, request.url, unescaped)) {
      return match
    }

    return `${attr}=${quote}${withReferenceNumber(request, unescaped).replaceAll('&', '&amp;')}${quote}`
  })

/**
 * Puts `?ref=` on every same-grant link of a rendered page. Vision renders the
 * view at marshal time through `source.manager._render`, so that is wrapped on
 * this one response: the view response itself (status, headers, cookies,
 * settings) is left untouched.
 *
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {symbol}
 */
const reattachReferenceNumberToRenderedLinks = (request, h) => {
  const ref = getReferenceNumber(request)
  const slug = request.params?.slug
  const response = /** @type {ViewResponse} */ (request.response)
  const source = response?.source
  const manager = source?.manager

  if (!ref || !slug || !manager || response.variety !== 'view') {
    return h.continue
  }

  source.manager = Object.create(manager, {
    _render: {
      value: async (...args) => rewriteLinks(request, slug, await manager._render(...args))
    }
  })

  return h.continue
}

/**
 * Runs {@link multiApplicationRedirect} for every grant route, before the plugin's
 * `page.getState` can create a blank application for a bad `?ref=`.
 *
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {Promise<symbol | ResponseObject>}
 */
const multiApplicationHandler = async (request, h) => {
  // Every grant route, the custom ones (application-deleted, ...) included: an unknown or
  // malformed ref must 404 there too, never fall back to an unscoped read or delete.
  if (!request.params?.slug || !request.auth?.isAuthenticated || !request.auth?.credentials?.contactId) {
    return h.continue
  }

  return multiApplicationRedirect(request, h)
}

/**
 * @import { Request, ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */

/**
 * A Vision `h.view()` response before rendering.
 *
 * @typedef {object} ViewResponse
 * @property {string} [variety]
 * @property {number} [statusCode]
 * @property {Record<string, string>} [headers]
 * @property {{ manager: { _render: (...args: unknown[]) => Promise<string> }, template: string, context: object, options?: object }} [source]
 */
