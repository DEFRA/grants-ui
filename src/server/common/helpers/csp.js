import { randomBytes } from 'node:crypto'

export const defaultContentPolicy = (nonce) => {
  const gtm = 'https://www.googletagmanager.com'
  const ga4 = 'https://www.google-analytics.com'
  const ga4WildCard = 'https://*.google-analytics.com'
  const gtmWildCard = 'https://*.googletagmanager.com'
  const self = "'self'"
  const statsDblClick = 'https://stats.g.doubleclick.net'

  const scriptSrc = [self, "'strict-dynamic'", `'nonce-${nonce}'`, gtm, ga4].join(' ')
  const connectSrc = [self, ga4, statsDblClick, ga4WildCard, gtmWildCard].join(' ')
  const fontSrc = [self, 'data:', 'https://fonts.gstatic.com'].join(' ')
  const imgSrc = [self, 'data:', 'blob:', ga4, statsDblClick, ga4WildCard].join(' ')

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
    'upgrade-insecure-requests'
  ].join('; ')
}

export function contentSecurityPolicy(request, h) {
  const response = request.response
  if (response?.isBoom) {
    return h.continue
  }

  const nonce = randomBytes(16).toString('base64')

  response.header('Content-Security-Policy', defaultContentPolicy(nonce))
  response.header('Referrer-Policy', 'no-referrer')
  response.header('X-CSP-Nonce', nonce)

  response.app.cspNonce = nonce

  if (response.variety === 'view') {
    response.source.context = { ...(response.source.context ?? {}), cspNonce: nonce }
  }

  return h.continue
}
