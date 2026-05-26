/**
 * Appends the current URL as a returnUrl parameter to cookie policy links in the banner.
 * This ensures that when the user is redirected back to the previous page
 * after managing their cookie preferences, they are returned to the same page
 * they were on before clicking the cookie link.
 *
 * The cookie policy URL is read from the cookie banner's data-cookie-policy-url attribute.
 * If no banner is present, this function exits early — the footer link's returnUrl is
 * handled server-side in the Nunjucks context.
 */
export const appendReturnUrlToLinks = () => {
  const cookieBanner = document.getElementById('cookie-banner')

  if (!cookieBanner) {
    return
  }

  const cookiePolicyUrl = cookieBanner.dataset.cookiePolicyUrl || '/cookies'
  const allAnchors = /** @type {HTMLAnchorElement[]} */ (Array.from(cookieBanner.querySelectorAll('a[href]')))
  const targetAbsoluteHref = new URL(cookiePolicyUrl, globalThis.location.origin).href
  const cookieLinks = allAnchors.filter((link) => {
    const rawHref = link.getAttribute('href') || ''
    const absoluteHref = new URL(rawHref, globalThis.location.origin).href
    return absoluteHref === targetAbsoluteHref
  })

  const returnUrl = globalThis.location.pathname + globalThis.location.search + globalThis.location.hash

  const hashIndex = cookiePolicyUrl.indexOf('#')
  const urlWithoutFragment = hashIndex !== -1 ? cookiePolicyUrl.substring(0, hashIndex) : cookiePolicyUrl
  const fragment = hashIndex !== -1 ? cookiePolicyUrl.substring(hashIndex) : ''
  const queryStart = urlWithoutFragment.indexOf('?')
  const queryString = queryStart === -1 ? '' : urlWithoutFragment.substring(queryStart + 1)
  const hasReturnUrl = new URLSearchParams(queryString).has('returnUrl')

  if (hasReturnUrl) {
    return
  }

  const separator = urlWithoutFragment.includes('?') ? '&' : '?'

  for (const link of cookieLinks) {
    // Use setAttribute to preserve relative URLs in href rather than normalising to absolute
    link.setAttribute('href', `${urlWithoutFragment}${separator}returnUrl=${encodeURIComponent(returnUrl)}${fragment}`)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', appendReturnUrlToLinks)
} else {
  appendReturnUrlToLinks()
}
