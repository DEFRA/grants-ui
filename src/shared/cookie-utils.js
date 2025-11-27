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
 * Deletes Google Analytics cookies
 * Removes _ga and any _ga_* cookies by setting their expiry in the past
 */
export const deleteGoogleAnalyticsCookies = () => {
  const cookies = document.cookie.split(';')

  for (const cookie of cookies) {
    const cookieName = cookie.split('=')[0].trim()
    if (cookieName === '_ga' || cookieName.startsWith('_ga_')) {
      document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`
      document.cookie = `${cookieName}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`
    }
  }
}

export { MILLISECONDS_PER_DAY, DEFAULT_EXPIRY_DAYS }
