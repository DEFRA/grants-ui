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
  const cookieLinks = document.querySelectorAll(`a[href="${cookiePolicyUrl}"]`)

  cookieLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault()
      const returnUrl = window.location.pathname + window.location.search
      window.location.href = `${cookiePolicyUrl}?returnUrl=${encodeURIComponent(returnUrl)}`
    })
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', appendReturnUrlToLinks)
} else {
  appendReturnUrlToLinks()
}
