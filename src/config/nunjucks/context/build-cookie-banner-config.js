/**
 * Builds the complete GOV.UK cookie banner configuration object.
 * The banner is wrapped in a <form> in template.njk so the buttons work
 * without JavaScript (progressive enhancement). With JavaScript, the
 * client-side script intercepts clicks and handles consent asynchronously.
 * @param {string} serviceName
 * @param {string} cookieConsentName
 * @param {number} cookieConsentExpiryDays
 * @param {string | undefined} gaTrackingId
 * @param {string} cookiePolicyUrl
 * @param {string | undefined} crumb - CSRF token for async XHR POST
 * @returns {object} GOV.UK cookie banner configuration
 */
export const buildCookieBannerConfig = (
  serviceName,
  cookieConsentName,
  cookieConsentExpiryDays,
  gaTrackingId,
  cookiePolicyUrl,
  crumb
) => ({
  ariaLabel: `Cookies on ${serviceName}`,
  classes: 'js-cookies-container js-cookies-banner',
  attributes: {
    'data-nosnippet': '',
    'data-cookie-name': cookieConsentName,
    'data-expiry-days': cookieConsentExpiryDays,
    'data-gtm-key': gaTrackingId,
    'data-cookie-policy-url': cookiePolicyUrl,
    'data-crumb': crumb
  },
  messages: [
    {
      headingText: `Cookies on ${serviceName}`,
      html: '<p class="govuk-body">We use some essential cookies to make this service work.</p><p class="govuk-body">We\'d also like to use analytics cookies so we can understand how you use the service and make improvements.</p>',
      classes: 'js-question-banner',
      actions: [
        {
          text: 'Accept analytics cookies',
          type: 'submit',
          name: 'analytics',
          value: 'true',
          classes: 'js-cookies-button-accept'
        },
        {
          text: 'Reject analytics cookies',
          type: 'submit',
          name: 'analytics',
          value: 'false',
          classes: 'js-cookies-button-reject'
        },
        {
          text: 'View cookies',
          href: cookiePolicyUrl
        }
      ]
    },
    {
      html: `<p class="govuk-body">You've accepted analytics cookies. You can <a class="govuk-link" href="${cookiePolicyUrl}">change your cookie settings</a> at any time.</p>`,
      role: 'alert',
      hidden: true,
      classes: 'js-cookies-accepted',
      actions: [
        {
          text: 'Hide this message',
          type: 'button',
          classes: 'js-hide'
        }
      ]
    },
    {
      html: `<p class="govuk-body">You've rejected analytics cookies. You can <a class="govuk-link" href="${cookiePolicyUrl}">change your cookie settings</a> at any time.</p>`,
      role: 'alert',
      hidden: true,
      classes: 'js-cookies-rejected',
      actions: [
        {
          text: 'Hide this message',
          type: 'button',
          classes: 'js-hide'
        }
      ]
    }
  ]
})
