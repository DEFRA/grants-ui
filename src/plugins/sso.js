/**
 * Builds the Defra Id organisation-selection redirect URL when the SSO query
 * parameter is present. Returns `null` when no SSO redirect is required so
 * callers can decide control flow without inspecting query state themselves.
 * @param {Request} request
 * @returns {string | null}
 */
const buildSsoRedirectUrl = (request) => {
  const ssoOrgId = request.query.ssoOrgId
  if (!ssoOrgId) {
    return null
  }

  const searchParams = new URLSearchParams(request.url.search)
  searchParams.delete('ssoOrgId') // Remove the SSO query parameter from the URL to avoid an endless loop

  const redirect = searchParams.size > 0 ? `${request.url.pathname}?${searchParams.toString()}` : request.url.pathname
  return `/auth/organisation?organisationId=${ssoOrgId}&redirect=${redirect}`
}

/**
 * Hapi `onRequest` extension that performs the SSO short-circuit. Both
 * `h.continue` (symbol) and `h.redirect().takeover()` (ResponseObject) are
 * valid Hapi lifecycle return values, so the union return type is declared
 * explicitly.
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {symbol | ResponseObject}
 */
const onSsoRequest = (request, h) => {
  // If the user has already selected an organisation in another service, pass the organisation Id to force Defra Id to skip the organisation selection screen
  const redirectUrl = buildSsoRedirectUrl(request)
  if (redirectUrl === null) {
    return h.continue // NOSONAR - Hapi onRequest lifecycle requires returning either h.continue (symbol) or a takeover ResponseObject; the union is intentional.
  }
  return h.redirect(redirectUrl).takeover()
}

export default {
  plugin: {
    name: 'sso',
    register: (/** @type {Server} */ server) => {
      server.ext('onRequest', onSsoRequest)
    }
  }
}

/**
 * @import { Server, Request, ResponseToolkit, ResponseObject } from '@hapi/hapi'
 */
