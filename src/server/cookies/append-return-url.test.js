import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupDOM, createEmptyPage, setupLoadingDocument } from './test-helpers.js'

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
  let window

  beforeEach(() => {
    vi.resetModules()
  })

  it('should exit early if cookie banner is not present', async () => {
    const setup = setupDOM(createEmptyPage(), 'http://localhost/some-page?foo=bar')
    document = setup.document
    window = setup.window

    const { appendReturnUrlToLinks } = await import('./append-return-url.js')

    expect(() => appendReturnUrlToLinks()).not.toThrow()
  })

  it('should use default cookie policy URL when data attribute is not present', async () => {
    const setup = setupDOM(createPageWithBannerNoDataAttribute(), 'http://localhost/some-page?foo=bar')
    document = setup.document
    window = setup.window

    const { appendReturnUrlToLinks } = await import('./append-return-url.js')
    appendReturnUrlToLinks()

    const cookieLink = document.querySelector('a[href="/cookies"]')
    expect(cookieLink).toBeDefined()
  })

  it.each([
    { cookiePolicyUrl: '/cookies', description: 'default cookie policy URL' },
    { cookiePolicyUrl: '/custom-cookies', description: 'custom cookie policy URL' }
  ])('should append returnUrl when using $description', async ({ cookiePolicyUrl }) => {
    const setup = setupDOM(createPageWithCookieBanner(cookiePolicyUrl), 'http://localhost/some-page?foo=bar')
    document = setup.document
    window = setup.window

    const { appendReturnUrlToLinks } = await import('./append-return-url.js')
    appendReturnUrlToLinks()

    const cookieLink = document.querySelector(`a[href="${cookiePolicyUrl}"]`)
    const clickEvent = new window.Event('click', { bubbles: true, cancelable: true })

    cookieLink.dispatchEvent(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
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
    window = setup.window

    Object.defineProperty(document, 'readyState', {
      writable: false,
      configurable: true,
      value: 'complete'
    })

    await import('./append-return-url.js')

    const cookieLink = document.querySelector('a[href="/cookies"]')
    const clickEvent = new window.Event('click', { bubbles: true, cancelable: true })

    cookieLink.dispatchEvent(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
  })
})
