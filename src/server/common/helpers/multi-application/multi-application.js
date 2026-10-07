import { multiApplicationRedirect } from '../../request-pipeline/redirects/multi-application-redirect.js'
import { getApplicationRef, withApplicationRef } from '../state/get-cache-key-helper.js'

const FORMS_ENGINE_PLUGIN_NAME = '@defra/forms-engine-plugin'
const REDIRECT_MIN = 300
const REDIRECT_MAX = 399
const OK = 200

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
      server.ext('onPostAuth', (request, h) => multiApplicationHandler(request, h))
      server.ext('onPreHandler', (request, h) => hideApplicationRefFromFormsEngine(request, h))
      server.ext('onPreResponse', (request, h) => reattachApplicationRef(request, h))
      // Runs last: it replaces the view with rendered HTML, so extensions that
      // add view context (the dev journey runner) must have run already.
      server.ext('onPreResponse', (request, h) => reattachApplicationRefToRenderedLinks(request, h), {
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
 * Moves `ref` off `request.query` onto `request.app.applicationRef` for
 * forms-engine routes, so the plugin never sees a query to strip.
 *
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {symbol}
 */
const hideApplicationRefFromFormsEngine = (request, h) => {
  if (!isFormsEngineRoute(request)) {
    return h.continue
  }

  const { ref, ...queryWithoutRef } = request.query ?? {}

  if (typeof ref !== 'string' || !ref) {
    return h.continue
  }

  // `query` is typed read-only but is a plain property at runtime.
  const mutableRequest = /** @type {{ query: Record<string, unknown>, app: { applicationRef?: string } }} */ (
    /** @type {unknown} */ (request)
  )
  mutableRequest.app ??= {}
  mutableRequest.app.applicationRef = ref
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
const reattachApplicationRef = (request, h) => {
  const ref = getApplicationRef(request)
  const slug = request.params?.slug
  const response = /** @type {{ statusCode?: number, headers?: Record<string, string> }} */ (request.response)
  const headers = response?.headers
  const location = headers?.location

  const isRedirect =
    typeof response?.statusCode === 'number' &&
    response.statusCode >= REDIRECT_MIN &&
    response.statusCode <= REDIRECT_MAX

  if (!ref || !slug || !isRedirect || !headers || typeof location !== 'string') {
    return h.continue
  }

  if (!staysInJourney(slug, location)) {
    return h.continue
  }

  headers.location = withApplicationRef(request, location)

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

  const resolved = new URL(link, pageUrl)

  return resolved.origin === pageUrl.origin && staysInJourney(slug, resolved.pathname)
}

/**
 * Puts `?ref=` on every same-grant link of a rendered page. Links are plain
 * paths with no hook to add a query, so the view is rendered here, rewritten
 * and returned in place of the original, keeping its status and headers.
 *
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {Promise<symbol | ResponseObject>}
 */
const reattachApplicationRefToRenderedLinks = async (request, h) => {
  const ref = getApplicationRef(request)
  const slug = request.params?.slug
  const response = /** @type {ViewResponse} */ (request.response)
  const source = response?.source

  if (!ref || !slug || !source || response.variety !== 'view') {
    return h.continue
  }

  const rendered = await source.manager.render(source.template, source.context, source.options, request)

  const rewritten = rendered.replace(LINK_ATTRIBUTE_PATTERN, (match, attr, quote, url) => {
    const unescaped = url.replaceAll('&amp;', '&')

    if (!isSameGrantLink(slug, request.url, unescaped)) {
      return match
    }

    return `${attr}=${quote}${withApplicationRef(request, unescaped).replaceAll('&', '&amp;')}${quote}`
  })

  const replacement = h.response(rewritten).code(response.statusCode ?? OK).type('text/html')

  for (const [name, value] of Object.entries(response.headers ?? {})) {
    replacement.header(name, value)
  }

  return replacement
}

/**
 * Runs {@link multiApplicationRedirect} for the plugin's own journey routes,
 * before `page.getState` can create a blank application for a bad `?ref=`.
 *
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {Promise<symbol | ResponseObject>}
 */
const multiApplicationHandler = async (request, h) => {
  const slug = request.params?.slug
  if (
    !slug ||
    !request.auth?.isAuthenticated ||
    !request.auth?.credentials?.contactId ||
    !isFormsEngineRoute(request)
  ) {
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
 * @property {{ manager: { render: (template: string, context: object, options: object | undefined, request: Request) => Promise<string> }, template: string, context: object, options?: object }} [source]
 */
