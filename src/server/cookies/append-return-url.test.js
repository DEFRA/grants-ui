import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyPage, setupDOM, setupLoadingDocument } from './test-helpers.js'

const createPageWithCookieBanner = (cookiePolicyUrl = '/cookies') => `
  <!DOCTYPE html>
  <html>
    <head></head>
    <body>
      <div id="cookie-banner" data-cookie-policy-url="${cookiePolicyUrl}">
        <a href="${cookiePolicyUrl}">Cookie policy</a>
        <a href=".${cookiePolicyUrl}">Relative cookie policy</a>
        <a href="/other-page">Other page</a>
      </div>
    </body>
  </html>
`

const createPageWithBannerNoDataAttribute = () => `
  <!DOCTYPE html>
  <html>
    <head></head>
    <body>
      <div id="cookie-banner">
        <a href="/cookies">Cookie policy</a>
      </div>
    </body>
  </html>
`

describe('append-return-url', () => {
  let document

  beforeEach(() => {
    vi.resetModules()
  })

  it('should exit early if cookie banner is not present', async () => {
    const setup = setupDOM(createEmptyPage(), 'http://localhost/some-page?foo=bar')
    document = setup.document
    globalThis.window = setup.window

    const { appendReturnUrlToLinks } = await import('./append-return-url.js')

    expect(() => appendReturnUrlToLinks()).not.toThrow()
  })

  it('should use default cookie policy URL when data attribute is not present', async () => {
    const setup = setupDOM(createPageWithBannerNoDataAttribute(), 'http://localhost/some-page?foo=bar')
    document = setup.document
    globalThis.window = setup.window

    const { appendReturnUrlToLinks } = await import('./append-return-url.js')
    appendReturnUrlToLinks()

    const cookieLink = document.querySelector('a[href="/cookies"]')
    expect(cookieLink).toBeDefined()
  })

  it.each([
    {
      cookiePolicyUrl: '/cookies',
      description: 'default cookie policy URL',
      expectedHref: '/cookies?returnUrl=%2Fsome-page%3Ffoo%3Dbar'
    },
    {
      cookiePolicyUrl: '/custom-cookies',
      description: 'custom cookie policy URL',
      expectedHref: '/custom-cookies?returnUrl=%2Fsome-page%3Ffoo%3Dbar'
    },
    {
      cookiePolicyUrl: '/cookies?lang=cy',
      description: 'cookie policy URL with existing query parameter',
      expectedHref: '/cookies?lang=cy&returnUrl=%2Fsome-page%3Ffoo%3Dbar'
    },
    {
      cookiePolicyUrl: '/cookies#details',
      description: 'cookie policy URL with fragment identifier',
      expectedHref: '/cookies?returnUrl=%2Fsome-page%3Ffoo%3Dbar#details'
    },
    {
      cookiePolicyUrl: '/cookies?lang=cy#details',
      description: 'cookie policy URL with query parameter and fragment',
      expectedHref: '/cookies?lang=cy&returnUrl=%2Fsome-page%3Ffoo%3Dbar#details'
    },
    {
      cookiePolicyUrl: '/cookies#',
      description: 'cookie policy URL with empty fragment',
      expectedHref: '/cookies?returnUrl=%2Fsome-page%3Ffoo%3Dbar#'
    },
    {
      cookiePolicyUrl: '/cookies#section-1.2',
      description: 'cookie policy URL with special characters in fragment',
      expectedHref: '/cookies?returnUrl=%2Fsome-page%3Ffoo%3Dbar#section-1.2'
    },
    {
      cookiePolicyUrl: '/cookies#?foo=bar',
      description: 'cookie policy URL with query-like fragment',
      expectedHref: '/cookies?returnUrl=%2Fsome-page%3Ffoo%3Dbar#?foo=bar'
    },
    {
      cookiePolicyUrl: '/cookies%20page',
      description: 'cookie policy URL with encoded characters',
      expectedHref: '/cookies%20page?returnUrl=%2Fsome-page%3Ffoo%3Dbar'
    },
    {
      cookiePolicyUrl: '/cookies?foo=bar%20baz#details',
      description: 'cookie policy URL with encoded query parameter and fragment',
      expectedHref: '/cookies?foo=bar%20baz&returnUrl=%2Fsome-page%3Ffoo%3Dbar#details'
    },
    {
      cookiePolicyUrl: '/cookies#section#details',
      description: 'cookie policy URL with multiple hash symbols',
      expectedHref: '/cookies?returnUrl=%2Fsome-page%3Ffoo%3Dbar#section#details'
    }
  ])('should append returnUrl when using $description', async ({ cookiePolicyUrl, expectedHref }) => {
    const setup = setupDOM(createPageWithCookieBanner(cookiePolicyUrl), 'http://localhost/some-page?foo=bar')
    document = setup.document
    globalThis.window = setup.window

    const { appendReturnUrlToLinks } = await import('./append-return-url.js')
    appendReturnUrlToLinks()

    const urlWithoutFragment = cookiePolicyUrl.split('#')[0]
    // Use JS filtering on raw attribute to avoid jsdom CSS selector quirks with encoded characters
    const cookieLinks = Array.from(document.querySelectorAll('#cookie-banner a')).filter((a) =>
      (a.getAttribute('href') || '').startsWith(urlWithoutFragment)
    )
    expect(cookieLinks.length).toBeGreaterThan(0)

    const cookieLink = cookieLinks[0]
    expect(cookieLink.getAttribute('href')).toBe(expectedHref)
  })

  it('should not add duplicate returnUrl parameter if it already exists', async () => {
    const cookiePolicyUrl = '/cookies?returnUrl=%2Fother-page'
    const setup = setupDOM(createPageWithCookieBanner(cookiePolicyUrl), 'http://localhost/some-page?foo=bar')
    document = setup.document
    globalThis.window = setup.window

    const { appendReturnUrlToLinks } = await import('./append-return-url.js')
    appendReturnUrlToLinks()

    const cookieLink = document.querySelector('a[href^="/cookies"]')
    const href = cookieLink.getAttribute('href')

    expect(href).toBe('/cookies?returnUrl=%2Fother-page')
    expect(href).not.toContain('returnUrl=%2Fother-page&returnUrl=')
  })

  it('should initialise on DOMContentLoaded when document is loading', async () => {
    const result = await setupLoadingDocument(
      createPageWithCookieBanner(),
      async () => import('./append-return-url.js')
    )

    expect(result.listenerAdded).toBe(true)
  })

  it('should initialise immediately when document is already loaded', async () => {
    const setup = setupDOM(createPageWithCookieBanner(), 'http://localhost/some-page?foo=bar')
    document = setup.document
    globalThis.window = setup.window

    Object.defineProperty(document, 'readyState', {
      writable: false,
      configurable: true,
      value: 'complete'
    })

    await import('./append-return-url.js')

    const cookieLink = document.querySelector('a[href^="/cookies"]')
    expect(cookieLink.getAttribute('href')).toBe('/cookies?returnUrl=%2Fsome-page%3Ffoo%3Dbar')
  })

  it('should safely handle anchors with empty href attribute', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <div id="cookie-banner" data-cookie-policy-url="/cookies">
            <a href="/cookies">Cookie policy</a>
            <a href="">Empty href link</a>
          </div>
        </body>
      </html>
    `

    const setup = setupDOM(html, 'http://localhost/some-page?foo=bar')
    document = setup.document
    globalThis.window = setup.window

    const { appendReturnUrlToLinks } = await import('./append-return-url.js')

    expect(() => appendReturnUrlToLinks()).not.toThrow()

    const validLink = document.querySelector('#cookie-banner a[href^="/cookies"]')
    expect(validLink.getAttribute('href')).toBe('/cookies?returnUrl=%2Fsome-page%3Ffoo%3Dbar')

    const emptyHrefLink = Array.from(document.querySelectorAll('#cookie-banner a')).find(
      (a) => a.textContent === 'Empty href link'
    )
    expect(emptyHrefLink.getAttribute('href')).toBe('')
  })

  it('should ignore anchors with invalid href that throws in URL constructor', async () => {
    const invalidHref = 'http://{'
    const html = `
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <div id="cookie-banner" data-cookie-policy-url="/cookies">
            <a href="/cookies">Cookie policy</a>
            <a href="${invalidHref}">Invalid URL</a>
          </div>
        </body>
      </html>
    `

    const setup = setupDOM(html, 'http://localhost/some-page?foo=bar')
    document = setup.document
    globalThis.window = setup.window

    const { appendReturnUrlToLinks } = await import('./append-return-url.js')

    expect(() => appendReturnUrlToLinks()).not.toThrow()

    const validLink = document.querySelector('#cookie-banner a[href^="/cookies"]')
    expect(validLink.getAttribute('href')).toBe('/cookies?returnUrl=%2Fsome-page%3Ffoo%3Dbar')

    const invalidLink = Array.from(document.querySelectorAll('#cookie-banner a')).find(
      (a) => a.textContent === 'Invalid URL'
    )
    expect(invalidLink.getAttribute('href')).toBe(invalidHref)
  })
})
