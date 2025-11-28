import {
  getCookie,
  getConsent,
  setConsent,
  loadGoogleAnalytics,
  deleteGoogleAnalyticsCookies,
  DEFAULT_EXPIRY_DAYS
} from '../../shared/cookie-utils.js'

export { loadGoogleAnalytics } from '../../shared/cookie-utils.js'

/**
 * Loads current cookie preferences from cookie storage and sets radio button states
 * @param {string} cookieName - Name of the cookie consent cookie
 * @param {HTMLInputElement | null} yesRadio - Radio button for accepting analytics
 * @param {HTMLInputElement | null} noRadio - Radio button for rejecting analytics
 */
const loadCurrentPreferences = (cookieName, yesRadio, noRadio) => {
  if (!yesRadio || !noRadio) {
    return
  }

  const existingCookie = getCookie(cookieName)
  if (existingCookie) {
    const currentConsent = getConsent(cookieName)
    if (currentConsent) {
      yesRadio.checked = true
    } else {
      noRadio.checked = true
    }
  }
}

/**
 * Handles the save button click event for cookie preferences
 * @param {Event} event - The click event
 * @param {HTMLFormElement} form - The cookie preferences form
 * @param {string} cookieName - Name of the cookie consent cookie
 * @param {number} expiryDays - Number of days until cookie expires
 * @param {string} gaTrackingId - Google Analytics tracking ID
 */
const handleSaveClick = (event, form, cookieName, expiryDays, gaTrackingId) => {
  event.preventDefault()

  const analyticsRadios = document.getElementsByName('analytics')
  let selectedValue = null

  for (const radio of Array.from(analyticsRadios)) {
    const inputRadio = /** @type {HTMLInputElement} */ (radio)
    if (inputRadio.checked) {
      selectedValue = inputRadio.value
      break
    }
  }

  if (!selectedValue) {
    return
  }

  const acceptAnalytics = selectedValue === 'yes'
  setConsent(acceptAnalytics, cookieName, expiryDays)

  if (acceptAnalytics && gaTrackingId) {
    loadGoogleAnalytics(gaTrackingId)
  } else {
    deleteGoogleAnalyticsCookies()
  }

  const referrer = form.dataset.referrer || '/'
  globalThis.location.href = referrer
}

export const initCookiePreferences = () => {
  const form = /** @type {HTMLFormElement | null} */ (document.getElementById('cookie-preferences-form'))

  if (!form) {
    return
  }

  const cookieName = form.dataset.cookieName || ''
  const expiryDays = Number.parseInt(form.dataset.expiryDays || String(DEFAULT_EXPIRY_DAYS), 10)
  const gaTrackingId = form.dataset.gaTrackingId || ''

  const yesRadio = /** @type {HTMLInputElement | null} */ (document.getElementById('analytics-yes'))
  const noRadio = /** @type {HTMLInputElement | null} */ (document.getElementById('analytics-no'))

  loadCurrentPreferences(cookieName, yesRadio, noRadio)

  const saveButton = document.getElementById('save-cookie-settings')
  if (saveButton) {
    saveButton.addEventListener('click', (event) => {
      handleSaveClick(event, form, cookieName, expiryDays, gaTrackingId)
    })
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCookiePreferences)
} else {
  initCookiePreferences()
}
