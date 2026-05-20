import { describe, expect, test } from 'vitest'
import { buildCookieBannerConfig } from '~/src/config/nunjucks/context/build-cookie-banner-config.js'

const mockCookieConfig = {
  serviceName: 'Test Service',
  cookieConsentName: 'test_cookie_consent',
  cookieConsentExpiryDays: 365,
  gaTrackingId: 'GTM-12345',
  cookiePolicyUrl: '/cookies'
}

const expectedBannerConfig = {
  ariaLabel: 'Cookies on Test Service',
  classes: 'js-cookies-container js-cookies-banner',
  attributes: {
    'data-nosnippet': '',
    'data-cookie-name': 'test_cookie_consent',
    'data-expiry-days': 365,
    'data-gtm-key': 'GTM-12345',
    'data-cookie-policy-url': '/cookies',
    'data-crumb': 'test-crumb-token'
  },
  messages: [
    {
      headingText: 'Cookies on Test Service',
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
          href: '/cookies'
        }
      ]
    },
    {
      html: '<p class="govuk-body">You\'ve accepted analytics cookies. You can <a class="govuk-link" href="/cookies">change your cookie settings</a> at any time.</p>',
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
      html: '<p class="govuk-body">You\'ve rejected analytics cookies. You can <a class="govuk-link" href="/cookies">change your cookie settings</a> at any time.</p>',
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
}

describe('buildCookieBannerConfig', () => {
  test('should build complete cookie banner configuration with all properties', () => {
    const { serviceName, cookieConsentName, cookieConsentExpiryDays, gaTrackingId, cookiePolicyUrl } = mockCookieConfig

    const result = buildCookieBannerConfig(
      serviceName,
      cookieConsentName,
      cookieConsentExpiryDays,
      gaTrackingId,
      cookiePolicyUrl,
      'test-crumb-token'
    )

    expect(result).toEqual(expectedBannerConfig)
  })

  test('should include crumb token in data-crumb attribute', () => {
    const result = buildCookieBannerConfig('My Service', 'cookie_consent', 365, undefined, '/cookies', 'my-crumb')
    expect(result.attributes['data-crumb']).toBe('my-crumb')
  })

  test('should have undefined data-crumb when crumb is not provided', () => {
    const result = buildCookieBannerConfig('My Service', 'cookie_consent', 365, undefined, '/cookies')
    expect(result.attributes['data-crumb']).toBeUndefined()
  })

  test('should handle undefined GA tracking ID', () => {
    const result = buildCookieBannerConfig('My Service', 'cookie_consent', 90, undefined, '/cookies', undefined)
    expect(result.attributes['data-gtm-key']).toBeUndefined()
  })

  test('should use service name in ariaLabel and heading', () => {
    const serviceName = 'Farm and land service'
    const result = buildCookieBannerConfig(serviceName, 'cookie_consent', 365, undefined, '/cookies')

    expect(result.ariaLabel).toBe('Cookies on Farm and land service')
    expect(result.messages[0].headingText).toBe('Cookies on Farm and land service')
  })

  test('should use custom cookie policy URL when provided', () => {
    const customUrl = '/custom/cookie-policy'
    const result = buildCookieBannerConfig('My Service', 'cookie_consent', 90, 'GTM-123', customUrl)

    expect(result.attributes['data-cookie-policy-url']).toBe(customUrl)
    expect(result.messages[0].actions[2].href).toBe(customUrl)
  })

  test('should include js-cookies-container and js-cookies-banner classes', () => {
    const result = buildCookieBannerConfig('My Service', 'cookie_consent', 365, undefined, '/cookies')
    expect(result.classes).toBe('js-cookies-container js-cookies-banner')
  })

  test('should include question banner with submit buttons', () => {
    const result = buildCookieBannerConfig('My Service', 'cookie_consent', 365, undefined, '/cookies')
    const questionMessage = result.messages[0]
    expect(questionMessage.classes).toBe('js-question-banner')
    expect(questionMessage.actions[0]).toMatchObject({
      type: 'submit',
      name: 'analytics',
      value: 'true',
      classes: 'js-cookies-button-accept'
    })
    expect(questionMessage.actions[1]).toMatchObject({
      type: 'submit',
      name: 'analytics',
      value: 'false',
      classes: 'js-cookies-button-reject'
    })
  })

  test('should include accepted and rejected confirmation messages', () => {
    const result = buildCookieBannerConfig('My Service', 'cookie_consent', 365, undefined, '/cookies')
    const acceptedMessage = result.messages[1]
    const rejectedMessage = result.messages[2]

    expect(acceptedMessage.classes).toBe('js-cookies-accepted')
    expect(acceptedMessage.hidden).toBe(true)
    expect(acceptedMessage.role).toBe('alert')
    expect(acceptedMessage.actions[0]).toMatchObject({ text: 'Hide this message', type: 'button', classes: 'js-hide' })

    expect(rejectedMessage.classes).toBe('js-cookies-rejected')
    expect(rejectedMessage.hidden).toBe(true)
    expect(rejectedMessage.role).toBe('alert')
    expect(rejectedMessage.actions[0]).toMatchObject({ text: 'Hide this message', type: 'button', classes: 'js-hide' })
  })
})
