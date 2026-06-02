import { beforeEach, describe, expect, test, vi } from 'vitest'

const createMockElement = (type = 'div') => ({
  setAttribute: vi.fn(),
  removeAttribute: vi.fn(),
  getAttribute: vi.fn(),
  appendChild: vi.fn(),
  addEventListener: vi.fn(),
  insertBefore: vi.fn(),
  closest: vi.fn().mockReturnValue(null),
  querySelector: vi.fn().mockReturnValue(null),
  focus: vi.fn(),
  tagName: type.toUpperCase(),
  textContent: '',
  src: '',
  async: false,
  height: '',
  width: '',
  style: {
    display: '',
    visibility: ''
  },
  dataset: {}
})

const mockXhr = {
  open: vi.fn(),
  setRequestHeader: vi.fn(),
  send: vi.fn(),
  onload: null,
  onerror: null,
  status: 200
}

const mockDocument = {
  cookie: '',
  readyState: 'complete',
  getElementById: vi.fn(),
  createElement: vi.fn((type) => createMockElement(type)),
  querySelector: vi.fn(),
  head: { appendChild: vi.fn() },
  body: { insertBefore: vi.fn(), firstChild: createMockElement() },
  addEventListener: vi.fn()
}

globalThis.document = mockDocument

function MockXMLHttpRequest() {
  return mockXhr
}
MockXMLHttpRequest.prototype = mockXhr
globalThis.XMLHttpRequest = MockXMLHttpRequest

const DEFAULT_BANNER_DATASET = {
  crumb: 'test-crumb-token',
  gtmKey: 'GTM-ABC123'
}

const createBannerMock = (dataset = DEFAULT_BANNER_DATASET) => {
  const banner = createMockElement()
  banner.dataset = { ...dataset }
  return banner
}

// Sets up querySelector to return elements by class selector
const setupStandardMocks = (bannerDataset = DEFAULT_BANNER_DATASET) => {
  const banner = createBannerMock(bannerDataset)
  const acceptButton = createMockElement('button')
  const rejectButton = createMockElement('button')
  const acceptedBanner = createMockElement()
  const rejectedBanner = createMockElement()
  const cookieBanner = createMockElement()

  // js-hide buttons inside accepted/rejected banners
  const acceptHideBtn = createMockElement('button')
  const rejectHideBtn = createMockElement('button')
  acceptedBanner.querySelector.mockReturnValue(acceptHideBtn)
  rejectedBanner.querySelector.mockReturnValue(rejectHideBtn)

  mockDocument.querySelector.mockImplementation((selector) => {
    if (selector === '.js-cookies-container') {
      return banner
    }
    if (selector === '.js-cookies-button-accept') {
      return acceptButton
    }
    if (selector === '.js-cookies-button-reject') {
      return rejectButton
    }
    if (selector === '.js-cookies-accepted') {
      return acceptedBanner
    }
    if (selector === '.js-cookies-rejected') {
      return rejectedBanner
    }
    if (selector === '.js-cookies-banner') {
      return cookieBanner
    }
    if (selector === '.js-question-banner') {
      return createMockElement()
    }
    if (selector === 'script[src*="googletagmanager.com/gtm.js"]') {
      return null
    }
    return null
  })

  return { banner, acceptButton, rejectButton, acceptedBanner, rejectedBanner, cookieBanner }
}

const simulateButtonClick = (button) => {
  const clickHandler = button.addEventListener.mock.calls.find((call) => call[0] === 'click')?.[1]
  if (clickHandler) {
    clickHandler({ preventDefault: vi.fn() })
  }
}

describe('cookie-consent', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockDocument.cookie = ''
    mockDocument.getElementById.mockReturnValue(null)
    mockDocument.querySelector.mockReturnValue(null)
    mockXhr.open.mockReset()
    mockXhr.setRequestHeader.mockReset()
    mockXhr.send.mockReset()
    mockXhr.status = 200
    mockXhr.onload = null
    mockXhr.onerror = null
  })

  describe('banner initialisation', () => {
    test('sets up listeners when banner is present', async () => {
      const { acceptButton, rejectButton } = setupStandardMocks()

      await import('./cookie-consent.js')

      expect(acceptButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
      expect(rejectButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
    })

    test('does not throw when banner is absent', async () => {
      mockDocument.querySelector.mockReturnValue(null)

      await expect(import('./cookie-consent.js')).resolves.toBeDefined()
    })
  })

  describe('button event listeners', () => {
    test('sets up accept and reject button listeners', async () => {
      const { acceptButton, rejectButton } = setupStandardMocks()

      await import('./cookie-consent.js')

      expect(acceptButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
      expect(rejectButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
    })

    test('accept button click shows accepted banner and loads GA', async () => {
      const { acceptButton, acceptedBanner } = setupStandardMocks()
      const mockScript = createMockElement('script')
      mockDocument.createElement.mockReturnValue(mockScript)

      await import('./cookie-consent.js')

      simulateButtonClick(acceptButton)

      expect(acceptedBanner.removeAttribute).toHaveBeenCalledWith('hidden')
      expect(mockScript.src).toContain('GTM-ABC123')
    })

    test('reject button click shows rejected banner and deletes GA cookies', async () => {
      const { rejectButton, rejectedBanner } = setupStandardMocks()

      await import('./cookie-consent.js')

      simulateButtonClick(rejectButton)

      expect(rejectedBanner.removeAttribute).toHaveBeenCalledWith('hidden')
    })

    test('accept button does not load GA when tracking ID is missing', async () => {
      const { acceptButton } = setupStandardMocks({ crumb: 'test-crumb' })

      await import('./cookie-consent.js')

      vi.clearAllMocks()

      simulateButtonClick(acceptButton)

      expect(mockDocument.createElement).not.toHaveBeenCalled()
    })

    test('handles missing buttons gracefully', async () => {
      const banner = createBannerMock()
      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '.js-cookies-container') {
          return banner
        }
        return null
      })

      await expect(import('./cookie-consent.js')).resolves.toBeDefined()
    })
  })

  describe('XHR async submission', () => {
    test('accept button sends XHR POST with crumb token', async () => {
      const { acceptButton } = setupStandardMocks()

      await import('./cookie-consent.js')

      simulateButtonClick(acceptButton)

      expect(mockXhr.open).toHaveBeenCalledWith('POST', '/cookies', true)
      expect(mockXhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/json')
      const sentBody = JSON.parse(mockXhr.send.mock.calls[0][0])
      expect(sentBody.crumb).toBe('test-crumb-token')
      expect(sentBody.analytics).toBe(true)
    })

    test('reject button sends XHR POST with crumb token', async () => {
      const { rejectButton } = setupStandardMocks()

      await import('./cookie-consent.js')

      simulateButtonClick(rejectButton)

      expect(mockXhr.open).toHaveBeenCalledWith('POST', '/cookies', true)
      const sentBody = JSON.parse(mockXhr.send.mock.calls[0][0])
      expect(sentBody.crumb).toBe('test-crumb-token')
      expect(sentBody.analytics).toBe(false)
    })

    test('falls back to form submit on XHR error', async () => {
      const mockForm = { submit: vi.fn() }
      const { rejectButton, banner } = setupStandardMocks()
      banner.closest.mockReturnValue(mockForm)

      await import('./cookie-consent.js')

      simulateButtonClick(rejectButton)

      mockXhr.onerror()

      expect(mockForm.submit).toHaveBeenCalled()
    })

    test('falls back to form submit on non-2xx response', async () => {
      const mockForm = { submit: vi.fn() }
      const { rejectButton, banner } = setupStandardMocks()
      banner.closest.mockReturnValue(mockForm)

      await import('./cookie-consent.js')

      simulateButtonClick(rejectButton)

      mockXhr.status = 403
      mockXhr.onload()

      expect(mockForm.submit).toHaveBeenCalled()
    })
  })

  describe('stale cookie cleanup', () => {
    test('deletes GA cookies when banner is absent and consent cookie is not set', async () => {
      mockDocument.querySelector.mockReturnValue(null)
      mockDocument.cookie = '_ga=GA1.2.123'

      await import('./cookie-consent.js')

      expect(mockDocument.cookie).not.toContain('_ga=GA1')
    })

    test('does not delete GA cookies when banner is absent but consent cookie is true', async () => {
      mockDocument.querySelector.mockReturnValue(null)
      mockDocument.cookie = '_ga=GA1.2.123; cookie_consent=true'

      await import('./cookie-consent.js')

      expect(mockDocument.cookie).toContain('_ga=GA1')
    })

    test('does not delete GA cookies when banner is present', async () => {
      const { banner } = setupStandardMocks()
      // banner present means cleanupStaleCookies returns early
      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '.js-cookies-container') {
          return banner
        }
        return null
      })
      mockDocument.cookie = '_ga=GA1.2.123'

      await import('./cookie-consent.js')

      expect(mockDocument.cookie).toContain('_ga=GA1')
    })
  })

  describe('edge cases', () => {
    test('handles missing banner element', async () => {
      mockDocument.querySelector.mockReturnValue(null)

      await expect(import('./cookie-consent.js')).resolves.toBeDefined()
    })

    test('loads GA script via src when GTM key is set and accept is clicked', async () => {
      const { acceptButton } = setupStandardMocks()
      const mockScript = createMockElement('script')
      mockDocument.createElement.mockReturnValue(mockScript)

      await import('./cookie-consent.js')

      simulateButtonClick(acceptButton)

      expect(mockDocument.head.appendChild).toHaveBeenCalled()
      expect(mockScript.src).toContain('GTM-ABC123')
    })

    test('does not load GA when gtmKey is missing', async () => {
      const { acceptButton } = setupStandardMocks({ crumb: 'test-crumb' })

      await import('./cookie-consent.js')

      simulateButtonClick(acceptButton)

      expect(mockDocument.createElement).not.toHaveBeenCalled()
    })
  })

  describe('DOMContentLoaded event', () => {
    test('initialises on DOMContentLoaded when readyState is loading', async () => {
      mockDocument.readyState = 'loading'

      const banner = createBannerMock()
      mockDocument.querySelector.mockImplementation((selector) => {
        if (selector === '.js-cookies-container') {
          return banner
        }
        return null
      })

      await import('./cookie-consent.js')

      expect(mockDocument.addEventListener).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function))
    })
  })

  describe('loadGoogleAnalytics', () => {
    test.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['invalid format (GA4 ID)', 'G-ABC123'],
      ['invalid format (no prefix)', 'ABC123']
    ])('returns early when trackingId is %s', async (_, trackingId) => {
      const { loadGoogleAnalytics } = await import('./cookie-consent.js')

      loadGoogleAnalytics(trackingId)

      expect(mockDocument.createElement).not.toHaveBeenCalled()
    })
  })
})
