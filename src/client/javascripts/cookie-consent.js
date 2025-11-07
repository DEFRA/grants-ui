const cookieBannerString = 'cookie-banner'

const getCookie = (name) => {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return parts[1].split(';')[0]
  }
  return null
}

const setCookie = (name, value, expiryDays) => {
  const date = new Date()
  date.setTime(date.getTime() + expiryDays * 24 * 60 * 60 * 1000)
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${value};${expires};path=/`
}

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

const getConsent = (cookieName) => {
  const consent = getCookie(cookieName)
  return consent === 'true'
}

const setConsent = (value, cookieName, expiryDays) => {
  setCookie(cookieName, value.toString(), expiryDays)
}

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
