import { beforeEach, describe, expect, test, vi } from 'vitest'

const createMockElement = (type = 'div') => ({
  setAttribute: vi.fn(),
  removeAttribute: vi.fn(),
  getAttribute: vi.fn(),
  appendChild: vi.fn(),
  addEventListener: vi.fn(),
  insertBefore: vi.fn(),
  tagName: type.toUpperCase(),
  textContent: '',
  src: '',
  height: '',
  width: '',
  style: {
    display: '',
    visibility: ''
  },
  dataset: {}
})

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

const DEFAULT_BANNER_CONFIG = {
  cookieName: 'cookie_consent',
  expiryDays: '365',
  gaTrackingId: 'GA-123'
}

const createBannerMock = (dataset = DEFAULT_BANNER_CONFIG) => {
  const banner = createMockElement()
  banner.dataset = { ...dataset }
  return banner
}

const createNonceScriptMock = (nonce = 'test-nonce') => {
  const script = createMockElement('script')
  script.getAttribute = vi.fn(() => nonce)
  return script
}

const setupGetElementByIdMock = (banner, acceptButton, rejectButton) => {
  mockDocument.getElementById.mockImplementation((id) => {
    if (id === 'cookie-banner') {
      return banner
    }

    if (id === 'cookie-banner-accept') {
      return acceptButton
    }

    if (id === 'cookie-banner-reject') {
      return rejectButton
    }

    return null
  })
}

const setupStandardMocks = (bannerDataset = DEFAULT_BANNER_CONFIG) => {
  const banner = createBannerMock(bannerDataset)
  const acceptButton = createMockElement('button')
  const rejectButton = createMockElement('button')

  setupGetElementByIdMock(banner, acceptButton, rejectButton)

  return { banner, acceptButton, rejectButton }
}

const simulateButtonClick = (button) => {
  const clickHandler = button.addEventListener.mock.calls.find((call) => call[0] === 'click')?.[1]

  if (clickHandler) {
    clickHandler()
  }
}

describe('cookie-consent', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockDocument.cookie = ''
    mockDocument.getElementById.mockReturnValue(null)
    mockDocument.querySelector.mockReturnValue(null)
  })

  describe('banner initialisation', () => {
    test('shows banner when no consent cookie exists', async () => {
      const { banner } = setupStandardMocks()
      mockDocument.cookie = ''

      await import('./cookie-consent.js')

      expect(mockDocument.getElementById).toHaveBeenCalledWith('cookie-banner')
      expect(banner.removeAttribute).toHaveBeenCalledWith('hidden')
    })

    test('does not show banner when consent cookie exists', async () => {
      const { banner } = setupStandardMocks()
      const mockNonceScript = createNonceScriptMock()

      mockDocument.querySelector.mockReturnValue(mockNonceScript)
      mockDocument.cookie = 'cookie_consent=true'

      await import('./cookie-consent.js')

      expect(banner.removeAttribute).not.toHaveBeenCalled()
    })
  })

  describe('button event listeners', () => {
    test('sets up accept and reject button listeners', async () => {
      const { acceptButton, rejectButton } = setupStandardMocks()

      await import('./cookie-consent.js')

      expect(acceptButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
      expect(rejectButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function))
    })

    test('accept button click sets cookie and hides banner', async () => {
      const { banner, acceptButton } = setupStandardMocks()

      await import('./cookie-consent.js')

      simulateButtonClick(acceptButton)

      expect(mockDocument.cookie).toContain('cookie_consent=true')
      expect(banner.setAttribute).toHaveBeenCalledWith('hidden', 'hidden')
    })

    test('reject button click sets cookie and hides banner', async () => {
      const { banner, rejectButton } = setupStandardMocks()

      await import('./cookie-consent.js')

      simulateButtonClick(rejectButton)

      expect(mockDocument.cookie).toContain('cookie_consent=false')
      expect(banner.setAttribute).toHaveBeenCalledWith('hidden', 'hidden')
    })

    test('accept button does not load GA when tracking ID is missing', async () => {
      const { acceptButton } = setupStandardMocks({
        cookieName: 'cookie_consent',
        expiryDays: '365'
      })

      await import('./cookie-consent.js')

      vi.clearAllMocks()

      simulateButtonClick(acceptButton)

      expect(mockDocument.createElement).not.toHaveBeenCalled()
    })

    test('handles missing buttons gracefully', async () => {
      const mockBanner = createBannerMock()

      setupGetElementByIdMock(mockBanner, null, null)

      await expect(import('./cookie-consent.js')).resolves.toBeDefined()
    })
  })

  describe('edge cases', () => {
    test('handles missing banner element', async () => {
      mockDocument.getElementById.mockReturnValue(null)

      await expect(import('./cookie-consent.js')).resolves.toBeDefined()
    })

    test('loads GA without nonce when no nonce script exists', async () => {
      setupStandardMocks()
      const mockScript = createMockElement('script')

      mockDocument.querySelector.mockReturnValue(null)
      mockDocument.createElement.mockReturnValue(mockScript)
      mockDocument.cookie = 'cookie_consent=true'

      await import('./cookie-consent.js')

      expect(mockScript.setAttribute).not.toHaveBeenCalledWith('nonce', expect.anything())
      expect(mockDocument.head.appendChild).toHaveBeenCalled()
    })

    test('uses default config values when dataset attributes are missing', async () => {
      const mockBanner = createMockElement()
      mockBanner.dataset = {}
      const mockAcceptButton = createMockElement('button')
      const mockRejectButton = createMockElement('button')

      setupGetElementByIdMock(mockBanner, mockAcceptButton, mockRejectButton)

      await import('./cookie-consent.js')

      simulateButtonClick(mockAcceptButton)

      expect(mockDocument.cookie).toContain('cookie_consent=true')
    })
  })

  describe('DOMContentLoaded event', () => {
    test('initialises on DOMContentLoaded when readyState is loading', async () => {
      mockDocument.readyState = 'loading'

      const mockBanner = createBannerMock()

      setupGetElementByIdMock(mockBanner, null, null)

      await import('./cookie-consent.js')

      expect(mockDocument.addEventListener).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function))
    })
  })

  describe('loadGoogleAnalytics', () => {
    test.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', '']
    ])('returns early when trackingId is %s', async (_, trackingId) => {
      const { loadGoogleAnalytics } = await import('./cookie-consent.js')

      loadGoogleAnalytics(trackingId)

      expect(mockDocument.createElement).not.toHaveBeenCalled()
    })
  })
})
