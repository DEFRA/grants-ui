import { COOKIE_PAGE_URL } from '~/src/server/cookies/constants.js'

/**
 * Builds the complete GOV.UK cookie banner configuration object
 * @param {string} serviceName
 * @param {string} cookieConsentName
 * @param {number} cookieConsentExpiryDays
 * @param {string | undefined} gaTrackingId
 * @returns {object} GOV.UK cookie banner configuration
 */
export const buildCookieBannerConfig = (serviceName, cookieConsentName, cookieConsentExpiryDays, gaTrackingId) => ({
  ariaLabel: `Cookies on ${serviceName}`,
  hidden: true,
  attributes: {
    'data-nosnippet': '',
    id: 'cookie-banner',
    'data-cookie-name': cookieConsentName,
    'data-expiry-days': cookieConsentExpiryDays,
    'data-ga-tracking-id': gaTrackingId,
    'data-cookie-policy-url': COOKIE_PAGE_URL
  },
  messages: [
    {
      headingText: `Cookies on ${serviceName}`,
      html: '<p class="govuk-body">We use some essential cookies to make this service work.</p><p class="govuk-body">We\'d like to set additional cookies to understand how you use the service, remember your settings and improve the service.</p>',
      actions: [
        {
          text: 'Accept analytics cookies',
          type: 'button',
          attributes: { id: 'cookie-banner-accept', 'data-module': 'govuk-button' }
        },
        {
          text: 'Reject analytics cookies',
          type: 'button',
          attributes: { id: 'cookie-banner-reject', 'data-module': 'govuk-button' }
        },
        {
          text: 'View cookies',
          href: COOKIE_PAGE_URL
        }
      ]
    }
  ]
})

/**
 * Builds the noscript fallback cookie banner configuration
 * @param {string} serviceName
 * @returns {object} GOV.UK cookie banner configuration for noscript
 */
export const buildCookieBannerNoscriptConfig = (serviceName) => ({
  ariaLabel: `Cookies on ${serviceName}`,
  attributes: { 'data-nosnippet': '' },
  messages: [
    {
      headingText: `Cookies on ${serviceName}`,
      html: '<p class="govuk-body">We use some essential cookies to make this service work.</p><p class="govuk-body">JavaScript is disabled, so you cannot set cookie preferences. Analytics cookies will not run.</p>'
    }
  ]
})
