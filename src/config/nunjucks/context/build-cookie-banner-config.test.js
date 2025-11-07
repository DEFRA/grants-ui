import { describe, expect, test } from 'vitest'
import {
  buildCookieBannerConfig,
  buildCookieBannerNoscriptConfig
} from '~/src/config/nunjucks/context/build-cookie-banner-config.js'

describe('buildCookieBannerConfig', () => {
  test('should build complete cookie banner configuration with all properties', () => {
    const serviceName = 'Test Service'
    const cookiePolicyUrl = '/cookie-policy'
    const cookieConsentName = 'test_cookie_consent'
    const cookieConsentExpiryDays = 365
    const gaTrackingId = 'GA-12345'

    const result = buildCookieBannerConfig(
      serviceName,
      cookiePolicyUrl,
      cookieConsentName,
      cookieConsentExpiryDays,
      gaTrackingId
    )

    expect(result).toEqual({
      ariaLabel: 'Cookies on Test Service',
      hidden: true,
      attributes: {
        'data-nosnippet': '',
        id: 'cookie-banner',
        'data-cookie-name': 'test_cookie_consent',
        'data-expiry-days': 365,
        'data-ga-tracking-id': 'GA-12345'
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
              href: '/cookie-policy'
            }
          ]
        }
      ]
    })
  })

  test('should handle undefined GA tracking ID', () => {
    const result = buildCookieBannerConfig('My Service', '/cookies', 'cookie_consent', 90, undefined)

    expect(result.attributes['data-ga-tracking-id']).toBeUndefined()
  })

  test('should use service name in ariaLabel and heading', () => {
    const serviceName = 'Manage land-based actions'
    const result = buildCookieBannerConfig(serviceName, '/cookies', 'cookie_consent', 365, undefined)

    expect(result.ariaLabel).toBe('Cookies on Manage land-based actions')
    expect(result.messages[0].headingText).toBe('Cookies on Manage land-based actions')
  })

  test('should include correct button IDs for JavaScript interaction', () => {
    const result = buildCookieBannerConfig('Test Service', '/cookies', 'cookie_consent', 365, 'GA-123')

    const actions = result.messages[0].actions
    expect(actions[0].attributes.id).toBe('cookie-banner-accept')
    expect(actions[1].attributes.id).toBe('cookie-banner-reject')
  })

  test('should set banner as hidden by default', () => {
    const result = buildCookieBannerConfig('Test Service', '/cookies', 'cookie_consent', 365, undefined)

    expect(result.hidden).toBe(true)
  })
})

describe('buildCookieBannerNoscriptConfig', () => {
  test('should build noscript configuration with correct structure', () => {
    const serviceName = 'Test Service'
    const result = buildCookieBannerNoscriptConfig(serviceName)

    expect(result).toEqual({
      ariaLabel: 'Cookies on Test Service',
      attributes: { 'data-nosnippet': '' },
      messages: [
        {
          headingText: 'Cookies on Test Service',
          html: '<p class="govuk-body">We use some essential cookies to make this service work.</p><p class="govuk-body">JavaScript is disabled, so you cannot set cookie preferences. Analytics cookies will not run.</p>'
        }
      ]
    })
  })

  test('should use service name in ariaLabel and heading', () => {
    const serviceName = 'Manage land-based actions'
    const result = buildCookieBannerNoscriptConfig(serviceName)

    expect(result.ariaLabel).toBe('Cookies on Manage land-based actions')
    expect(result.messages[0].headingText).toBe('Cookies on Manage land-based actions')
  })

  test('should not include actions in noscript config', () => {
    const result = buildCookieBannerNoscriptConfig('Test Service')

    expect(result.messages[0].actions).toBeUndefined()
  })

  test('should include data-nosnippet attribute', () => {
    const result = buildCookieBannerNoscriptConfig('Test Service')

    expect(result.attributes['data-nosnippet']).toBe('')
  })
})
