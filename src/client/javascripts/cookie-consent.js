import {
  getCookie,
  getConsent,
  setConsent,
  loadGoogleAnalytics,
  deleteGoogleAnalyticsCookies
} from '../../shared/cookie-utils.js'

export { loadGoogleAnalytics } from '../../shared/cookie-utils.js'

const cookieBannerString = 'cookie-banner'

/**
 * Reads the cookie banner config from the banner element's dataset.
 * @returns {CookieConfig | null} The config, or null if the banner is not in the DOM.
 */
const getCookieConfig = () => {
  const banner = document.getElementById(cookieBannerString)
  if (!banner) {
    return null
  }

  return {
    cookieName: banner.dataset.cookieName || 'cookie_consent',
    expiryDays: Number.parseInt(banner.dataset.expiryDays || '365', 10),
    gaTrackingId: banner.dataset.gaTrackingId
  }
}

/**
 * @param {string} cookieName - The name of the consent cookie to check for.
 * @returns {boolean} True if the cookie is present (a consent decision has been recorded).
 */
const hasConsent = (cookieName) => {
  return getCookie(cookieName) !== null
}

/**
 * @returns {void}
 */
const showBanner = () => {
  const banner = document.getElementById(cookieBannerString)
  if (banner) {
    banner.removeAttribute('hidden')
  }
}

/**
 * @returns {void}
 */
const hideBanner = () => {
  const banner = document.getElementById(cookieBannerString)
  if (banner) {
    banner.setAttribute('hidden', 'hidden')
  }
}

/**
 * @param {CookieConfig} config
 * @returns {void}
 */
const handleAccept = (config) => {
  setConsent(true, config.cookieName, config.expiryDays)
  hideBanner()

  if (config.gaTrackingId) {
    loadGoogleAnalytics(config.gaTrackingId)
  }
}

/**
 * @param {CookieConfig} config
 * @returns {void}
 */
const handleReject = (config) => {
  setConsent(false, config.cookieName, config.expiryDays)
  deleteGoogleAnalyticsCookies()
  hideBanner()
}

/**
 * Initialises the cookie consent banner: wires accept/reject buttons and
 * loads Google Analytics if prior consent has been granted.
 * @returns {void}
 */
export const initCookieConsent = () => {
  const config = getCookieConfig()

  if (!config) {
    return
  }

  if (hasConsent(config.cookieName)) {
    if (getConsent(config.cookieName) && config.gaTrackingId) {
      loadGoogleAnalytics(config.gaTrackingId)
    }
  } else {
    showBanner()
  }

  const acceptButton = document.getElementById('cookie-banner-accept')
  const rejectButton = document.getElementById('cookie-banner-reject')

  if (acceptButton) {
    acceptButton.addEventListener('click', () => handleAccept(config))
  }

  if (rejectButton) {
    rejectButton.addEventListener('click', () => handleReject(config))
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCookieConsent)
} else {
  initCookieConsent()
}

/**
 * @typedef {object} CookieConfig
 * @property {string} cookieName - Name of the consent cookie.
 * @property {number} expiryDays - Days until the consent cookie expires.
 * @property {string | undefined} gaTrackingId - Google Analytics tracking ID, if configured.
 */
