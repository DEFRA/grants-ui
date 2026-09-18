import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applicationWindowClosedRedirect } from './application-window-closed-redirect.js'
import { isWindowClosedMockEnabled } from '../../helpers/mock-overrides.js'

vi.mock('../../helpers/mock-overrides.js', () => ({
  isWindowClosedMockEnabled: vi.fn()
}))

describe('applicationWindowClosedRedirect', () => {
  const h = {
    continue: Symbol('continue'),
    redirect: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isWindowClosedMockEnabled).mockReturnValue(false)
  })

  function buildRequest({ slug = 'test-grant', path = '/test-grant/start', isApplicationWindowOpen, name } = {}) {
    return {
      params: { slug },
      path,
      yar: { set: vi.fn(), get: vi.fn(), clear: vi.fn() },
      app: {
        model: {
          def: {
            name,
            metadata: { isApplicationWindowOpen }
          }
        }
      }
    }
  }

  it('returns h.continue when the window is open', () => {
    const request = buildRequest({ isApplicationWindowOpen: true })
    const context = { state: { applicationStatus: undefined } }

    const result = applicationWindowClosedRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('returns h.continue when the flag is absent (default open)', () => {
    const request = buildRequest({ isApplicationWindowOpen: undefined })
    const context = { state: {} }

    const result = applicationWindowClosedRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it.each(['SUBMITTED', 'REOPENED', 'CLAIM_STARTED', 'CLAIM_SUBMITTED'])(
    'returns h.continue when window is closed but application status is %s',
    (applicationStatus) => {
      const request = buildRequest({ isApplicationWindowOpen: false })
      const context = { state: { applicationStatus } }

      const result = applicationWindowClosedRedirect(request, h, context)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    }
  )

  it.each([undefined, 'CLEARED'])(
    'redirects to the application-window-closed page when window is closed and status is %s',
    (applicationStatus) => {
      const takeover = Symbol('takeover')
      h.redirect.mockReturnValue({ takeover: () => takeover })

      const request = buildRequest({ isApplicationWindowOpen: false, name: 'Test Grant' })
      const context = { state: { applicationStatus } }

      const result = applicationWindowClosedRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/application-window-closed')
      expect(request.yar.set).toHaveBeenCalledWith('applicationWindowClosedSchemeName', 'Test Grant')
      expect(result).toBe(takeover)
    }
  )

  it('returns h.continue when already on the application-window-closed page', () => {
    const request = buildRequest({
      isApplicationWindowOpen: false,
      path: '/test-grant/application-window-closed'
    })
    const context = { state: {} }

    const result = applicationWindowClosedRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('redirects when the dev-tools mock is enabled, even if the metadata flag is open', () => {
    const takeover = Symbol('takeover')
    h.redirect.mockReturnValue({ takeover: () => takeover })
    vi.mocked(isWindowClosedMockEnabled).mockReturnValue(true)

    const request = buildRequest({ isApplicationWindowOpen: true, name: 'Test Grant' })
    const context = { state: {} }

    const result = applicationWindowClosedRedirect(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/test-grant/application-window-closed')
    expect(result).toBe(takeover)
  })

  it('returns h.continue when the mock is enabled but the application is already submitted', () => {
    vi.mocked(isWindowClosedMockEnabled).mockReturnValue(true)

    const request = buildRequest({ isApplicationWindowOpen: true })
    const context = { state: { applicationStatus: 'SUBMITTED' } }

    const result = applicationWindowClosedRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })
})
