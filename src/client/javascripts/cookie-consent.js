import {
  getCookie,
  getConsent,
  setConsent,
  loadGoogleAnalytics,
  deleteGoogleAnalyticsCookies
} from '../../shared/cookie-utils.js'

export { loadGoogleAnalytics } from '../../shared/cookie-utils.js'

const cookieBannerString = 'cookie-banner'

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

const hasConsent = (cookieName) => {
  return getCookie(cookieName) !== null
}

const showBanner = () => {
  const banner = document.getElementById(cookieBannerString)
  if (banner) {
    banner.removeAttribute('hidden')
  }
}

const hideBanner = () => {
  const banner = document.getElementById(cookieBannerString)
  if (banner) {
    banner.setAttribute('hidden', 'hidden')
  }
}

const handleAccept = (config) => {
  setConsent(true, config.cookieName, config.expiryDays)
  hideBanner()

  if (config.gaTrackingId) {
    loadGoogleAnalytics(config.gaTrackingId)
  }
}

const handleReject = (config) => {
  setConsent(false, config.cookieName, config.expiryDays)
  deleteGoogleAnalyticsCookies()
  hideBanner()
}

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
