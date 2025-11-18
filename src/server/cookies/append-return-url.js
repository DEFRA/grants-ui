/**
 * Appends the current URL as a returnUrl parameter to cookie links.
 * This ensures that when the user is redirected back to the previous page
 * after managing their cookie preferences, they are returned to the same page
 * they were on before clicking the cookie link.
 *
 * The cookie policy URL is read from the cookie banner's data-cookie-policy-url attribute,
 * which is configured via the COOKIE_POLICY_URL environment variable (default: /cookies)
 */
export const appendReturnUrlToLinks = () => {
  const cookieBanner = document.getElementById('cookie-banner')
  if (!cookieBanner) {
    return
  }

  const cookiePolicyUrl = cookieBanner.dataset.cookiePolicyUrl || '/cookies'
  const cookieLinks = /** @type {HTMLAnchorElement[]} */ (
    Array.from(document.querySelectorAll(`a[href="${cookiePolicyUrl}"]`))
  )
  const returnUrl = globalThis.location.pathname + globalThis.location.search + globalThis.location.hash

  const hashIndex = cookiePolicyUrl.indexOf('#')
  const urlWithoutFragment = hashIndex !== -1 ? cookiePolicyUrl.substring(0, hashIndex) : cookiePolicyUrl
  const fragment = hashIndex !== -1 ? cookiePolicyUrl.substring(hashIndex) : ''
  const hasReturnUrl = /[?&]returnUrl=/.test(urlWithoutFragment)

  if (hasReturnUrl) {
    return
  }

  const separator = urlWithoutFragment.includes('?') ? '&' : '?'

  for (const link of cookieLinks) {
    link.href = `${urlWithoutFragment}${separator}returnUrl=${encodeURIComponent(returnUrl)}${fragment}`
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', appendReturnUrlToLinks)
} else {
  appendReturnUrlToLinks()
}
