import { describe, expect, test } from 'vitest'
import { buildNotificationBannerConfig } from '~/src/config/nunjucks/context/build-notification-banner-config.js'

const baseBanner = {
  enabled: true,
  titleText: 'Important',
  text: 'Draft applications must be submitted by Thursday, 1 February 2027 or they will be lost'
}

const classes = 'govuk-!-margin-top-4 govuk-!-margin-bottom-0'
const plainResult = { titleText: 'Important', classes, text: baseBanner.text }

describe('buildNotificationBannerConfig', () => {
  test('returns null when metadata has no notification banner', () => {
    expect(buildNotificationBannerConfig(undefined, '/example/page-one')).toBeNull()
  })

  test('returns null when banner is not enabled', () => {
    expect(buildNotificationBannerConfig({ ...baseBanner, enabled: false }, '/example/page-one')).toBeNull()
  })

  test('returns null when enabled but text is missing', () => {
    expect(buildNotificationBannerConfig({ enabled: true, titleText: 'Important' }, '/example/page-one')).toBeNull()
  })

  test('throws when enabled but titleText is missing', () => {
    expect(() => buildNotificationBannerConfig({ enabled: true, text: 'Heads up' }, '/example/page-one')).toThrow(
      'Notification banner is enabled but "titleText" is not set'
    )
  })

  test('throws on a missing titleText even on an excluded page', () => {
    expect(() => buildNotificationBannerConfig({ enabled: true, text: 'Heads up' }, '/example/confirmation')).toThrow(
      'Notification banner is enabled but "titleText" is not set'
    )
  })

  test('returns titleText, classes and text for a plain banner', () => {
    expect(buildNotificationBannerConfig(baseBanner, '/example/page-one')).toEqual(plainResult)
  })

  test('uses the configured titleText', () => {
    const result = buildNotificationBannerConfig({ enabled: true, titleText: 'Scheme update', text: 'Heads up' }, '/x')
    expect(result).toEqual({ titleText: 'Scheme update', classes, text: 'Heads up' })
  })

  test('builds html with an escaped link when a link is provided', () => {
    const result = buildNotificationBannerConfig(
      { ...baseBanner, link: { text: 'Read more', href: 'https://gov.uk/deadline' } },
      '/example/page-one'
    )

    expect(result).toEqual({
      titleText: 'Important',
      classes,
      html:
        `<p class="govuk-notification-banner__heading">${baseBanner.text}</p>` +
        '<p class="govuk-body"><a class="govuk-notification-banner__link" href="https://gov.uk/deadline">Read more</a></p>'
    })
  })

  test('escapes HTML in text, link text and href', () => {
    const result = buildNotificationBannerConfig(
      {
        enabled: true,
        titleText: 'Important',
        text: 'Deadline <b>soon</b> & final',
        link: { text: 'Read "more"', href: 'https://gov.uk/?a=1&b=2' }
      },
      '/example/page-one'
    )

    expect(result.html).toBe(
      '<p class="govuk-notification-banner__heading">Deadline &lt;b&gt;soon&lt;/b&gt; &amp; final</p>' +
        '<p class="govuk-body"><a class="govuk-notification-banner__link" href="https://gov.uk/?a=1&amp;b=2">Read &quot;more&quot;</a></p>'
    )
  })

  test.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox', 'http://'])(
    'drops an unsafe or unparseable link href (%s) and falls back to plain text',
    (href) => {
      expect(
        buildNotificationBannerConfig({ ...baseBanner, link: { text: 'Read more', href } }, '/example/page-one')
      ).toEqual(plainResult)
    }
  )

  test('accepts a same-origin relative path href', () => {
    const result = buildNotificationBannerConfig(
      { ...baseBanner, link: { text: 'Read more', href: '/updates' } },
      '/example/page-one'
    )
    expect(result.html).toContain('href="/updates"')
  })

  test.each([{ text: 'Read more' }, { href: 'https://gov.uk' }, {}])(
    'throws when a link is declared but incomplete (%o)',
    (link) => {
      expect(() => buildNotificationBannerConfig({ ...baseBanner, link }, '/example/page-one')).toThrow(
        'Notification banner is enabled but the link is missing "text" or "href"'
      )
    }
  )

  test('throws on an incomplete link even on an excluded page', () => {
    expect(() =>
      buildNotificationBannerConfig({ ...baseBanner, link: { text: 'Read more' } }, '/example/confirmation')
    ).toThrow('Notification banner is enabled but the link is missing "text" or "href"')
  })

  test.each(['/example/confirmation', '/example/print-submitted-application'])(
    'returns null on the excluded page %s',
    (path) => {
      expect(buildNotificationBannerConfig(baseBanner, path)).toBeNull()
    }
  )

  test('renders on a non-excluded path', () => {
    expect(buildNotificationBannerConfig(baseBanner, '/example/summary')).not.toBeNull()
  })

  test('honours a custom excludedPathSuffixes argument', () => {
    expect(buildNotificationBannerConfig(baseBanner, '/example/summary', ['/summary'])).toBeNull()
    expect(buildNotificationBannerConfig(baseBanner, '/example/confirmation', ['/summary'])).not.toBeNull()
  })

  test('handles an undefined current path', () => {
    expect(buildNotificationBannerConfig(baseBanner, undefined)).toEqual(plainResult)
  })
})
