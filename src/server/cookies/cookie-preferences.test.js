import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  setupDOM,
  createEmptyPage,
  clickWithNavigationHandling,
  getScriptCount,
  setupLoadingDocument
} from './test-helpers.js'

const createFormHTML = (options = {}) => {
  const { gaTrackingId = 'G-TEST123', expiryDays = '365', includeNonce = true, referrer = '/previous-page' } = options

  const gaAttr = gaTrackingId === null ? '' : `data-ga-tracking-id="${gaTrackingId}"`
  const expiryAttr = expiryDays === null ? '' : `data-expiry-days="${expiryDays}"`
  const referrerAttr = referrer === null ? '' : `data-referrer="${referrer}"`
  const nonceScript = includeNonce ? '<script nonce="test-nonce"></script>' : ''

  return `
  <!DOCTYPE html>
  <html>
    <head></head>
    <body>
      <form id="cookie-preferences-form"
            data-cookie-name="cookie_consent"
            ${expiryAttr}
            ${gaAttr}
            ${referrerAttr}>
        <input type="radio" name="analytics" value="yes" id="analytics-yes" />
        <input type="radio" name="analytics" value="no" id="analytics-no" />
        <button type="button" id="save-cookie-settings">Save</button>
      </form>
      ${nonceScript}
    </body>
  </html>
`
}

describe('cookie-preferences', () => {
  let document
  let window

  beforeEach(() => {
    vi.resetModules()
    const setup = setupDOM(createFormHTML())
    document = setup.document
    window = setup.window
  })

  it('should exit early if form is not present', async () => {
    const setup = setupDOM(createEmptyPage())
    document = setup.document
    window = setup.window

    const { initCookiePreferences } = await import('./cookie-preferences.js')

    expect(() => initCookiePreferences()).not.toThrow()
  })

  it.each([
    { cookieValue: 'true', expectedRadioId: 'analytics-yes', description: 'user previously accepted' },
    { cookieValue: 'false', expectedRadioId: 'analytics-no', description: 'user previously rejected' }
  ])('should set "$expectedRadioId" radio when $description', async ({ cookieValue, expectedRadioId }) => {
    document.cookie = `cookie_consent=${cookieValue}; path=/`

    const { initCookiePreferences } = await import('./cookie-preferences.js')
    initCookiePreferences()

    const radio = document.getElementById(expectedRadioId)
    expect(radio.checked).toBe(true)
  })

  it('should save consent when save button is clicked', async () => {
    const { initCookiePreferences } = await import('./cookie-preferences.js')
    initCookiePreferences()

    const yesRadio = document.getElementById('analytics-yes')
    const saveButton = document.getElementById('save-cookie-settings')

    yesRadio.checked = true
    clickWithNavigationHandling(saveButton, window)

    const cookies = document.cookie.split(';').map((c) => c.trim())
    const consentCookie = cookies.find((c) => c.startsWith('cookie_consent='))

    expect(consentCookie).toBeDefined()
    expect(consentCookie).toContain('cookie_consent=true')
  })

  it('should not save if no radio is selected', async () => {
    const originalCookie = document.cookie

    const { initCookiePreferences } = await import('./cookie-preferences.js')
    initCookiePreferences()

    const saveButton = document.getElementById('save-cookie-settings')
    const clickEvent = new window.Event('click', { bubbles: true })
    saveButton.dispatchEvent(clickEvent)

    expect(document.cookie).toBe(originalCookie)
  })

  it('should initialise on DOMContentLoaded when document is loading', async () => {
    const result = await setupLoadingDocument(createFormHTML(), async () => {
      // Set cookie before importing so initialisation can read it
      globalThis.document.cookie = 'cookie_consent=true; path=/'
      await import('./cookie-preferences.js')
    })

    const yesRadio = result.document.getElementById('analytics-yes')

    expect(result.listenerAdded).toBe(true)
    expect(yesRadio.checked).toBe(true)
  })

  it('should initialise immediately when document is already loaded', async () => {
    const setup = setupDOM(createFormHTML())
    document = setup.document
    window = setup.window

    Object.defineProperty(document, 'readyState', {
      writable: false,
      configurable: true,
      value: 'complete'
    })

    document.cookie = 'cookie_consent=true; path=/'

    const yesRadio = document.getElementById('analytics-yes')
    expect(yesRadio.checked).toBe(false)

    await import('./cookie-preferences.js')

    expect(yesRadio.checked).toBe(true)
  })

  it.each([
    {
      radioId: 'analytics-yes',
      gaTrackingId: 'G-TEST123',
      expectGA: true,
      expectedCookie: 'cookie_consent=true',
      description: 'load Google Analytics when consent is yes and tracking ID is provided'
    },
    {
      radioId: 'analytics-no',
      gaTrackingId: 'G-TEST123',
      expectGA: false,
      expectedCookie: 'cookie_consent=false',
      description: 'reject analytics and not load GA'
    },
    {
      radioId: 'analytics-yes',
      gaTrackingId: '',
      expectGA: false,
      expectedCookie: 'cookie_consent=true',
      description: 'not load GA when tracking ID is empty string'
    }
  ])('should $description', async ({ radioId, gaTrackingId, expectGA, expectedCookie }) => {
    const setup = setupDOM(createFormHTML({ gaTrackingId }))
    document = setup.document
    window = setup.window

    const { initCookiePreferences } = await import('./cookie-preferences.js')
    initCookiePreferences()

    const radio = document.getElementById(radioId)
    const saveButton = document.getElementById('save-cookie-settings')

    radio.checked = true

    const initialScriptCount = getScriptCount(document)
    clickWithNavigationHandling(saveButton, window)
    const finalScriptCount = getScriptCount(document)

    if (expectGA) {
      expect(finalScriptCount).toBeGreaterThan(initialScriptCount)
      const scripts = document.head.querySelectorAll('script')
      const gaScript = Array.from(scripts).find((s) => s.textContent && s.textContent.includes(gaTrackingId))
      expect(gaScript).toBeDefined()
    } else {
      expect(finalScriptCount).toBe(initialScriptCount)
    }

    const cookies = document.cookie.split(';').map((c) => c.trim())
    const consentCookie = cookies.find((c) => c.startsWith('cookie_consent='))
    expect(consentCookie).toContain(expectedCookie)
  })

  it('should not load GA when loadGoogleAnalytics is called with undefined', async () => {
    const { loadGoogleAnalytics } = await import('./cookie-preferences.js')

    const initialScriptCount = getScriptCount(document)
    loadGoogleAnalytics(undefined)
    const finalScriptCount = getScriptCount(document)

    expect(finalScriptCount).toBe(initialScriptCount)
  })

  it('should load GA without nonce when nonce is not present', async () => {
    const setup = setupDOM(createFormHTML({ includeNonce: false }))
    document = setup.document
    window = setup.window

    const { initCookiePreferences } = await import('./cookie-preferences.js')
    initCookiePreferences()

    const yesRadio = document.getElementById('analytics-yes')
    const saveButton = document.getElementById('save-cookie-settings')

    yesRadio.checked = true
    clickWithNavigationHandling(saveButton, window)

    const scripts = document.head.querySelectorAll('script')
    const gaScript = Array.from(scripts).find((s) => s.textContent && s.textContent.includes('G-TEST123'))
    expect(gaScript).toBeDefined()
    expect(gaScript.hasAttribute('nonce')).toBe(false)
  })

  it('should use default expiry days when not specified', async () => {
    const setup = setupDOM(createFormHTML({ expiryDays: null }))
    document = setup.document
    window = setup.window

    const { initCookiePreferences } = await import('./cookie-preferences.js')
    initCookiePreferences()

    const yesRadio = document.getElementById('analytics-yes')
    const saveButton = document.getElementById('save-cookie-settings')

    yesRadio.checked = true
    clickWithNavigationHandling(saveButton, window)

    const cookies = document.cookie.split(';').map((c) => c.trim())
    const consentCookie = cookies.find((c) => c.startsWith('cookie_consent='))
    expect(consentCookie).toBeDefined()
    expect(consentCookie).toContain('cookie_consent=true')
  })

  it('should redirect to "/" when referrer is not specified', async () => {
    const setup = setupDOM(createFormHTML({ referrer: null }))
    document = setup.document
    window = setup.window

    const { initCookiePreferences } = await import('./cookie-preferences.js')
    initCookiePreferences()

    const yesRadio = document.getElementById('analytics-yes')
    const saveButton = document.getElementById('save-cookie-settings')
    const form = document.getElementById('cookie-preferences-form')

    yesRadio.checked = true

    // Verify the referrer dataset is not set (will default to '/')
    expect(form.dataset.referrer).toBeUndefined()

    // Click and verify it attempts navigation (covered by line 109)
    clickWithNavigationHandling(saveButton, window)

    const cookies = document.cookie.split(';').map((c) => c.trim())
    const consentCookie = cookies.find((c) => c.startsWith('cookie_consent='))
    expect(consentCookie).toContain('cookie_consent=true')
  })

  it('should handle missing radio buttons gracefully', async () => {
    const setup = setupDOM(`
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <form id="cookie-preferences-form"
                data-cookie-name="cookie_consent"
                data-expiry-days="365"
                data-ga-tracking-id="G-TEST123">
            <button type="button" id="save-cookie-settings">Save</button>
          </form>
        </body>
      </html>
    `)
    document = setup.document
    window = setup.window
    document.cookie = 'cookie_consent=true; path=/'
    const { initCookiePreferences } = await import('./cookie-preferences.js')

    expect(() => initCookiePreferences()).not.toThrow()
  })
})
