import { randomBytes } from 'node:crypto'
import { config } from '~/src/config/config.js'
import { getIdentityProviderOrigin } from '~/src/server/auth/get-identity-provider-origin.js'
import { error, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const defaultContentPolicy = (/** @type {string} */ nonce, /** @type {string | null} */ identityProviderOrigin) => {
  const gtm = 'https://www.googletagmanager.com'
  const gtmWildCard = 'https://*.googletagmanager.com'
  const ga4 = 'https://www.google-analytics.com'
  const ga4WildCard = 'https://*.google-analytics.com'
  const self = "'self'"
  const statsDblClick = 'https://stats.g.doubleclick.net'
  // Hash for GOV.UK Frontend inline progressive enhancement script.
  // This is a known hash published by the Design System team.
  // See: https://frontend.design-system.service.gov.uk/import-javascript/
  const govukFrontendHash = "'sha256-GUQ5ad8JK5KmEWmROf3LZd9ge94daqNvd8xy9YS1iDw='"
  // --- TEMPORARY: OS Maps vs OpenStreetMap comparison (TGC-1418 follow-up) ---
  // The parcel map's OpenStreetMap basemap option loads its style/tiles
  // directly from CartoCDN (unlike OS Maps, which is proxied server-side).
  // Allowed unconditionally because the basemap-provider toggle is a
  // runtime choice, not a per-deployment one. Delete cartoCdn/cartoTiles and
  // their two usages below once the comparison is complete.
  const cartoCdn = 'https://basemaps.cartocdn.com'
  const cartoTiles = 'https://*.basemaps.cartocdn.com'
  // --- END TEMPORARY ---

  const scriptSrc = [self, "'strict-dynamic'", `'nonce-${nonce}'`, govukFrontendHash, gtmWildCard, ga4].join(' ')
  const connectSrc = [self, ga4, statsDblClick, ga4WildCard, gtmWildCard, cartoCdn, cartoTiles].join(' ')
  const fontSrc = [self, 'data:', 'https://fonts.gstatic.com'].join(' ')
  const imgSrc = [self, 'data:', 'blob:', ga4, statsDblClick, ga4WildCard, cartoCdn, cartoTiles].join(' ')
  const workerSrc = [self, 'blob:'].join(' ')

  const formActionSrc = [self]
  if (config.get('externalLinks.sfd.enabled')) {
    const sfdUpdateUrl = config.get('externalLinks.sfd.updateUrl')?.trim()
    if (sfdUpdateUrl) {
      if (URL.canParse(sfdUpdateUrl)) {
        formActionSrc.push(new URL(sfdUpdateUrl).origin)

        if (identityProviderOrigin) {
          formActionSrc.push(identityProviderOrigin)
        } else {
          error(LogCodes.SYSTEM.CSP_IDENTITY_PROVIDER_ORIGIN_INVALID, { identityProviderOrigin })
        }
      } else {
        error(LogCodes.SYSTEM.CSP_SFD_UPDATE_URL_INVALID, { sfdUpdateUrl })
      }
    }
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    `form-action ${formActionSrc.join(' ')}`,
    `script-src ${scriptSrc}`,
    `connect-src ${connectSrc}`,
    `img-src ${imgSrc}`,
    "style-src 'self' 'unsafe-inline'",
    `font-src ${fontSrc}`,
    `frame-src ${gtm}`,
    `worker-src ${workerSrc}`,
    'upgrade-insecure-requests'
  ].join('; ')
}

/**
 * @returns {string}
 */
function generateNewNonce() {
  return randomBytes(16).toString('base64')
}

export const contentSecurityPolicy = {
  name: 'content-security-policy',
  register: async (/** @type {Server} */ server) => {
    const identityProviderOrigin = await getIdentityProviderOrigin()

    server.ext('onRequest', (/** @type {Request} */ request, /** @type {ResponseToolkit} */ h) => {
      request.app.cspNonce = generateNewNonce()
      return h.continue
    })

    server.ext('onPreResponse', (/** @type {Request} */ request, /** @type {ResponseToolkit} */ h) => {
      const response = /** @type {PossibleResponse} */ (/** @type {unknown} */ (request.response))
      const nonce = request.app.cspNonce
      if (response?.isBoom) {
        if (typeof response.header === 'function') {
          response.header('Content-Security-Policy', "default-src 'none'")
        }

        return h.continue
      }

      if (typeof response.header === 'function') {
        response.header(
          'Content-Security-Policy',
          defaultContentPolicy(/** @type {string} */ (nonce), identityProviderOrigin)
        )
        response.header('Referrer-Policy', 'no-referrer')

        // Only set this header in non-production environments for debugging
        if (!config.get('isProduction')) {
          response.header('X-CSP-Nonce', /** @type {string} */ (nonce))
        }
      }

      if (response.variety === 'view') {
        response.source.context = { ...(response.source.context ?? {}), cspNonce: nonce }
      }

      return h.continue
    })
  }
}

/**
 * @import { Server, Request, ResponseToolkit } from '@hapi/hapi'
 */

/**
 * Hapi exposes `request.response` as `ResponseObject | Boom`, but downstream
 * code here duck-types the union. This captures just the properties this
 * plugin touches; the const is assigned via a double-cast through `unknown`
 * because no Hapi-supplied union member is structurally narrower than this.
 * @typedef {object} PossibleResponse
 * @property {boolean} [isBoom]
 * @property {(name: string, value: string) => unknown} [header]
 * @property {string} [variety]
 * @property {{ context?: Record<string, unknown> }} source
 */
