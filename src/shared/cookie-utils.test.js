import { describe, test, expect, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'

describe('deleteGoogleAnalyticsCookies', () => {
  let document
  let window

  beforeEach(() => {
    vi.resetModules()

    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost'
    })

    document = dom.window.document
    window = dom.window

    globalThis.document = document
    globalThis.window = window

    document.cookie.split(';').forEach((cookie) => {
      const name = cookie.split('=')[0].trim()
      if (name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      }
    })
  })

  test('should delete _ga cookie', async () => {
    document.cookie = '_ga=GA1.2.123456789.1234567890; path=/'

    const { deleteGoogleAnalyticsCookies } = await import('./cookie-utils.js')
    deleteGoogleAnalyticsCookies()

    expect(document.cookie).not.toContain('_ga=GA1')
  })

  test('should delete _ga_ prefixed cookies', async () => {
    document.cookie = '_ga_ABC123=GS1.1.1234567890.1.0.1234567890.0; path=/'

    const { deleteGoogleAnalyticsCookies } = await import('./cookie-utils.js')
    deleteGoogleAnalyticsCookies()

    expect(document.cookie).not.toContain('_ga_ABC123')
  })

  test('should not delete non-Google Analytics cookies', async () => {
    document.cookie = 'cookie_consent=true; path=/'
    document.cookie = 'session_id=abc123; path=/'
    document.cookie = '_ga=GA1.2.123456789.1234567890; path=/'

    const { deleteGoogleAnalyticsCookies } = await import('./cookie-utils.js')
    deleteGoogleAnalyticsCookies()

    expect(document.cookie).toContain('cookie_consent=true')
    expect(document.cookie).toContain('session_id=abc123')
    expect(document.cookie).not.toContain('_ga=')
  })

  test('should handle empty cookie string gracefully', async () => {
    document.cookie = ''

    const { deleteGoogleAnalyticsCookies } = await import('./cookie-utils.js')

    expect(() => deleteGoogleAnalyticsCookies()).not.toThrow()
  })
})
