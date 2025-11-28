const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_EXPIRY_DAYS = 365

/**
 * Gets a cookie value by name
 * @param {string} name - The name of the cookie to retrieve
 * @returns {string | null} The cookie value or null if not found
 */
export const getCookie = (name) => {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return parts[1].split(';')[0]
  }
  return null
}

/**
 * Sets a cookie with an expiration date
 * @param {string} name - The name of the cookie
 * @param {string} value - The value to store
 * @param {number} expiryDays - Number of days until the cookie expires
 */
export const setCookie = (name, value, expiryDays) => {
  const date = new Date()
  date.setTime(date.getTime() + expiryDays * MILLISECONDS_PER_DAY)
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${value};${expires};path=/`
}

/**
 * Gets the consent status from a cookie
 * @param {string} cookieName - The name of the consent cookie
 * @returns {boolean} True if consent is given, false otherwise
 */
export const getConsent = (cookieName) => {
  const consent = getCookie(cookieName)
  return consent === 'true'
}

/**
 * Sets the consent status in a cookie
 * @param {boolean} value - The consent value to store
 * @param {string} cookieName - The name of the consent cookie
 * @param {number} expiryDays - Number of days until the cookie expires
 */
export const setConsent = (value, cookieName, expiryDays) => {
  setCookie(cookieName, value.toString(), expiryDays)
}

/**
 * Loads Google Analytics (GTM) script with CSP nonce support
 * @param {string} trackingId - The Google Analytics tracking ID
 */
export const loadGoogleAnalytics = (trackingId) => {
  if (!trackingId) {
    return
  }

  const existingScript = document.querySelector('script[nonce]')
  const nonce = existingScript ? existingScript.getAttribute('nonce') : null

  const script = document.createElement('script')
  if (nonce) {
    script.setAttribute('nonce', nonce)
  }
  script.textContent = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','${trackingId}');`

  document.head.appendChild(script)

  const noscript = document.createElement('noscript')
  const iframe = document.createElement('iframe')
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${trackingId}`
  iframe.height = '0'
  iframe.width = '0'
  iframe.style.display = 'none'
  iframe.style.visibility = 'hidden'
  noscript.appendChild(iframe)

  document.body.insertBefore(noscript, document.body.firstChild)
}

/**
 * Builds the list of domain variations to attempt when deleting cookies.
 *
 * Google Analytics often sets cookies on a parent domain (e.g. `.defra.cloud`)
 * rather than the full leaf hostname. To delete GA cookies reliably, we must
 * attempt deletion on every registrable parent domain level.
 *
 * For a hostname such as `grants-ui.dev.cdp-int.defra.cloud`, this function
 * generates:
 *
 *   grants-ui.dev.cdp-int.defra.cloud
 *   .grants-ui.dev.cdp-int.defra.cloud
 *   .dev.cdp-int.defra.cloud
 *   .cdp-int.defra.cloud
 *   .defra.cloud
 *
 * It intentionally stops before the public suffix (e.g. `.cloud`, `.com`,
 * `.co.uk`), because browsers do not allow cookies to be set or removed at
 * those levels.
 *
 * @param {string} hostname - The full hostname from which to derive parent domains.
 * @returns {Set<string>} A set of domain strings to use when deleting cookies.
 */
function buildDeletableDomains(hostname) {
  const domains = new Set()

  domains.add(hostname)
  domains.add('.' + hostname)

  const parts = hostname.split('.')

  for (let i = 1; i < parts.length - 1; i++) {
    domains.add('.' + parts.slice(i).join('.'))
  }

  return domains
}

/**
 * Deletes Google Analytics cookies
 * Removes `_ga` and any `_ga_*` cookies by setting their expiry in the past.
 * Attempts deletion on all parent domain levels to handle GA cookies that
 * were set on higher-level domains (e.g. `.defra.cloud`).
 *
 * Uses multiple domain variants because browsers only delete a cookie when
 * the deletion domain matches (or is more specific than) the domain where
 * the cookie was originally set.
 */
export const deleteGoogleAnalyticsCookies = () => {
  const cookies = document.cookie.split(';')
  const hostname = window.location.hostname

  const domains = buildDeletableDomains(hostname)

  for (const cookie of cookies) {
    const cookieName = cookie.split('=')[0].trim()
    if (cookieName === '_ga' || cookieName.startsWith('_ga_')) {
      // Delete no-domain version
      document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`

      // Delete domain versions
      for (const domain of domains) {
        document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${domain}`
      }
    }
  }
}

export { MILLISECONDS_PER_DAY, DEFAULT_EXPIRY_DAYS }
