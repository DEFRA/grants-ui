import { describe, expect, test } from 'vitest'
import {
  buildCookieBannerConfig,
  buildCookieBannerNoscriptConfig
} from '~/src/config/nunjucks/context/build-cookie-banner-config.js'

const mockCookieConfig = {
  serviceName: 'Test Service',
  cookieConsentName: 'test_cookie_consent',
  cookieConsentExpiryDays: 365,
  gaTrackingId: 'GA-12345',
  cookiePolicyUrl: '/cookies'
}

const expectedBannerConfig = {
  ariaLabel: 'Cookies on Test Service',
  hidden: true,
  attributes: {
    'data-nosnippet': '',
    id: 'cookie-banner',
    'data-cookie-name': 'test_cookie_consent',
    'data-expiry-days': 365,
    'data-ga-tracking-id': 'GA-12345',
    'data-cookie-policy-url': '/cookies'
  },
  messages: [
    {
      headingText: 'Cookies on Test Service',
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
          href: '/cookies'
        }
      ]
    }
  ]
}

const expectedNoscriptConfig = {
  ariaLabel: 'Cookies on Test Service',
  attributes: { 'data-nosnippet': '' },
  messages: [
    {
      headingText: 'Cookies on Test Service',
      html: '<p class="govuk-body">We use some essential cookies to make this service work.</p><p class="govuk-body">JavaScript is disabled, so you cannot set cookie preferences. Analytics cookies will not run.</p>'
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
      cookiePolicyUrl
    )

    expect(result).toEqual(expectedBannerConfig)
  })

  test('should handle undefined GA tracking ID', () => {
    const result = buildCookieBannerConfig('My Service', 'cookie_consent', 90, undefined, '/cookies')

    expect(result.attributes['data-ga-tracking-id']).toBeUndefined()
  })

  test.each([
    { func: buildCookieBannerConfig, name: 'buildCookieBannerConfig' },
    { func: buildCookieBannerNoscriptConfig, name: 'buildCookieBannerNoscriptConfig' }
  ])('$name should use service name in ariaLabel and heading', ({ func }) => {
    const serviceName = 'Farm and land service'
    const result =
      func === buildCookieBannerConfig
        ? func(serviceName, 'cookie_consent', 365, undefined, '/cookies')
        : func(serviceName)

    expect(result.ariaLabel).toBe('Cookies on Farm and land service')
    expect(result.messages[0].headingText).toBe('Cookies on Farm and land service')
  })

  test('should use custom cookie policy URL when provided', () => {
    const customUrl = '/custom/cookie-policy'
    const result = buildCookieBannerConfig('My Service', 'cookie_consent', 90, 'GA-123', customUrl)

    expect(result.attributes['data-cookie-policy-url']).toBe(customUrl)
    expect(result.messages[0].actions[2].href).toBe(customUrl)
  })
})

describe('buildCookieBannerNoscriptConfig', () => {
  test('should build noscript configuration with correct structure', () => {
    const { serviceName } = mockCookieConfig
    const result = buildCookieBannerNoscriptConfig(serviceName)

    expect(result).toEqual(expectedNoscriptConfig)
  })
})
