import { randomBytes } from 'node:crypto'
import { config } from '~/src/config/config.js'

const defaultContentPolicy = (nonce) => {
  const gtm = 'https://www.googletagmanager.com'
  const ga4 = 'https://www.google-analytics.com'
  const ga4WildCard = 'https://*.google-analytics.com'
  const gtmWildCard = 'https://*.googletagmanager.com'
  const self = "'self'"
  const statsDblClick = 'https://stats.g.doubleclick.net'

  // MapLibre GL spawns a Web Worker from a blob URL and fetches vector tiles
  // from external tile servers. Both require explicit CSP allowances.
  const cartoCdn = 'https://basemaps.cartocdn.com'
  const cartoTiles = 'https://*.basemaps.cartocdn.com'

  const scriptSrc = [self, "'strict-dynamic'", `'nonce-${nonce}'`, gtm, ga4].join(' ')
  // Allow local Land Grants tile server in non-production environments
  const localTileServer = config.get('isProduction') ? '' : 'http://localhost:3009'
  const connectSrc = [self, ga4, statsDblClick, ga4WildCard, gtmWildCard, cartoCdn, cartoTiles, localTileServer].filter(Boolean).join(' ')
  const fontSrc = [self, 'data:', 'https://fonts.gstatic.com'].join(' ')
  const imgSrc = [self, 'data:', 'blob:', ga4, statsDblClick, ga4WildCard, cartoCdn, cartoTiles].join(' ')
  const workerSrc = [self, 'blob:'].join(' ')

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
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

function generateNewNonce() {
  return randomBytes(16).toString('base64')
}

export const contentSecurityPolicy = {
  name: 'content-security-policy',
  register: (server) => {
    server.ext('onRequest', (request, h) => {
      request.app.cspNonce = generateNewNonce()
      return h.continue
    })

    server.ext('onPreResponse', (request, h) => {
      const response = request.response
      const nonce = request.app.cspNonce
      if (response?.isBoom) {
        if (typeof response.header === 'function') {
          response.header('Content-Security-Policy', "default-src 'none'")
        }

        return h.continue
      }

      if (typeof response.header === 'function') {
        response.header('Content-Security-Policy', defaultContentPolicy(nonce))
        response.header('Referrer-Policy', 'no-referrer')

        // Only set this header in non-production environments for debugging
        if (!config.get('isProduction')) {
          response.header('X-CSP-Nonce', nonce)
        }
      }

      if (response.variety === 'view') {
        response.source.context = { ...(response.source.context ?? {}), cspNonce: nonce }
      }

      return h.continue
    })
  }
}
