// Client-side cookie consent management.
//
// This module progressively enhances the cookie banner. When JavaScript
// is available, it intercepts the banner's form buttons and handles
// consent asynchronously — providing a smoother user experience.
//
// KEY BEHAVIOURS:
//
// 1. IMMEDIATE GTM LOADING ON ACCEPT:
//    When the user clicks "Accept analytics cookies", loadGoogleAnalytics()
//    dynamically creates a <script> element pointing to GTM. This means
//    analytics start tracking immediately — the user doesn't need to wait
//    for a page reload. The GTM container ID is read from a data attribute
//    on the banner element (set server-side from config).
//
// 2. GA COOKIE DELETION ON REJECT:
//    When the user clicks "Reject analytics cookies", ALL Google Analytics
//    cookies are deleted immediately. GA cookies can be set on multiple
//    domain variants (e.g. .example.com, .service.example.com), so we
//    build a list of all possible domains and delete on each one.
//    The cookie prefixes we look for: _ga, _gid, _gat, _dc_gtm_
//
// 3. ASYNC SUBMISSION WITH CSRF:
//    The consent choice is sent to the server via XHR POST with the
//    CSRF token (crumb) in the JSON body. The server persists the
//    choice in the consent cookie. If XHR fails, the form's native
//    submission is the fallback.
//
// 4. STALE COOKIE CLEANUP:
//    cleanupStaleCookies() handles an edge case: if a user accepted
//    analytics, GA cookies were set, but then the consent cookie expired
//    or was cleared. On the next page load, the banner would reappear
//    (confirmed: false) but GA cookies would still exist. If the banner
//    is absent and the consent cookie is not set to true, we proactively
//    delete any leftover GA cookies.

import { deleteGoogleAnalyticsCookies, getConsent, loadGoogleAnalytics } from '../../shared/cookie-utils.js'

const HTTP_2XX_RANGE_START = 200
const HTTP_2XX_RANGE_END = 299

export { loadGoogleAnalytics } from '../../shared/cookie-utils.js'

/**
 * Initialises the cookie consent banner: wires accept/reject buttons and
 * loads Google Analytics if prior consent has been granted.
 * @returns {void}
 */
export const initCookieConsent = () => {
  setupCookieComponentListeners()
  cleanupStaleCookies()
}

// Handle edge case: GA cookies exist but consent was lost.
// If no consent cookie is recorded and no banner is showing,
// delete any orphaned GA cookies.
const cleanupStaleCookies = () => {
  const cookieContainer = document.querySelector('.js-cookies-container')

  // If banner is present, user hasn't consented yet — don't cleanup
  // during this page load (they'll make a choice via the banner)
  if (cookieContainer) {
    return
  }

  // If the user has consented, GA cookies are legitimate — don't delete them
  const cookieName = 'cookie_consent'
  if (getConsent(cookieName)) {
    return
  }

  // No consent recorded and no banner showing — GA cookies are stale, remove them
  deleteGoogleAnalyticsCookies()
}

// Wire up event listeners for the cookie banner buttons.
// This is the progressive enhancement layer — it intercepts the
// default form submission and handles everything via JavaScript.
const setupCookieComponentListeners = () => {
  const cookieContainer = document.querySelector('.js-cookies-container')

  if (!cookieContainer) {
    return
  }

  const acceptButton = document.querySelector('.js-cookies-button-accept')
  const rejectButton = document.querySelector('.js-cookies-button-reject')
  const acceptedBanner = document.querySelector('.js-cookies-accepted')
  const rejectedBanner = document.querySelector('.js-cookies-rejected')
  const cookieBanner = document.querySelector('.js-cookies-banner')

  // Read server-generated values from data attributes
  const crumb = /** @type {HTMLElement} */ (cookieContainer).dataset.crumb
  const gtmKey = /** @type {HTMLElement} */ (cookieContainer).dataset.gtmKey

  // Send the consent choice to the server via XHR.
  // The crumb (CSRF token) is sent in the JSON body.
  // @hapi/crumb accepts it there for JSON content-type requests.
  //
  // On a 2xx response, onSuccess is called.
  // On any non-2xx or network error, the page form is submitted natively
  // as a fallback so the consent is never silently lost.
  const formElement = cookieContainer.closest('form')

  const submitPreference = (accepted, onSuccess) => {
    const xhr = new XMLHttpRequest() // eslint-disable-line no-undef

    xhr.open('POST', '/cookies', true)
    xhr.setRequestHeader('Content-Type', 'application/json')

    xhr.onload = () => {
      if (xhr.status >= HTTP_2XX_RANGE_START && xhr.status <= HTTP_2XX_RANGE_END) {
        onSuccess()
      } else {
        // Server rejected the request (e.g. stale CSRF token) — fall back
        // to a native form POST so the consent is not silently lost.
        formElement?.submit()
      }
    }

    xhr.onerror = () => {
      // Network failure — fall back to native form POST.
      formElement?.submit()
    }

    xhr.send(
      JSON.stringify({
        analytics: accepted,
        async: true,
        crumb
      })
    )
  }

  // Transition from the question banner to the accepted/rejected
  // confirmation banner. Uses ARIA attributes for screen readers.
  const showBanner = (banner) => {
    const questionBanner = document.querySelector('.js-question-banner')
    questionBanner?.setAttribute('hidden', 'hidden')
    banner.removeAttribute('hidden')
    banner.setAttribute('tabindex', '-1')
    banner.focus()

    banner.addEventListener('blur', () => {
      banner.removeAttribute('tabindex')
    })
  }

  // ACCEPT: Show confirmation, load GTM immediately, persist choice.
  // No redirect after XHR — the cookie is persisted server-side.
  // The next natural page navigation will render GTM from the server,
  // avoiding a duplicate page_view from loading GTM twice on the same page.
  acceptButton?.addEventListener('click', (event) => {
    event.preventDefault()
    showBanner(acceptedBanner)
    loadGoogleAnalytics(gtmKey ?? '')
    submitPreference(true, () => {})
  })

  // REJECT: Show confirmation, delete GA cookies immediately, persist choice.
  // No redirect — the confirmation banner stays visible and GA cookies are
  // already deleted client-side. Server-side deletion happens on next load.
  rejectButton?.addEventListener('click', (event) => {
    event.preventDefault()
    showBanner(rejectedBanner)
    deleteGoogleAnalyticsCookies()
    submitPreference(false, () => {})
  })

  // "Hide this message" buttons on the confirmation banners
  acceptedBanner?.querySelector('.js-hide')?.addEventListener('click', () => {
    cookieBanner?.setAttribute('hidden', 'hidden')
  })

  rejectedBanner?.querySelector('.js-hide')?.addEventListener('click', () => {
    cookieBanner?.setAttribute('hidden', 'hidden')
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCookieConsent)
} else {
  initCookieConsent()
}
