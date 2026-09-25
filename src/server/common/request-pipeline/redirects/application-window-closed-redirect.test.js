import { describe, expect, it, vi } from 'vitest'
import { resolveApplicationWindowClosedPath } from './application-window-closed-redirect.js'

describe('resolveApplicationWindowClosedPath', () => {
  const CLOSED = { closesAt: '2000-01-01T00:00:00Z' }
  const OPEN = { closesAt: '2999-01-01T00:00:00Z' }

  function buildRequest({ slug = 'test-grant', path = '/test-grant/start', name, applicationWindow } = {}) {
    return {
      params: { slug },
      path,
      yar: { set: vi.fn(), get: vi.fn(), clear: vi.fn() },
      app: {
        model: {
          def: { name, metadata: { applicationWindow } }
        }
      }
    }
  }

  it.each([
    ['open', OPEN],
    ['absent (default open)', undefined]
  ])('returns null when the application window is %s', (_label, applicationWindow) => {
    const request = buildRequest({ applicationWindow })
    const context = { state: {} }

    const result = resolveApplicationWindowClosedPath(request, context)

    expect(result).toBeNull()
    expect(request.yar.set).not.toHaveBeenCalled()
  })

  it.each(['SUBMITTED', 'REOPENED', 'CLAIM_STARTED', 'CLAIM_SUBMITTED'])(
    'returns null when window is closed but application status is %s',
    (applicationStatus) => {
      const request = buildRequest({ applicationWindow: CLOSED })
      const context = { state: { applicationStatus } }

      const result = resolveApplicationWindowClosedPath(request, context)

      expect(result).toBeNull()
      expect(request.yar.set).not.toHaveBeenCalled()
    }
  )

  it.each([undefined, 'CLEARED'])(
    'returns the application-window-closed path when window is closed and status is %s',
    (applicationStatus) => {
      const request = buildRequest({ name: 'Test Grant', applicationWindow: CLOSED })
      const context = { state: { applicationStatus } }

      const result = resolveApplicationWindowClosedPath(request, context)

      expect(result).toBe('/test-grant/application-window-closed')
      expect(request.yar.set).toHaveBeenCalledWith('applicationWindowClosedSchemeName', {
        'test-grant': 'Test Grant'
      })
    }
  )

  it("keeps other grants' stored scheme names when storing this one", () => {
    const request = buildRequest({ name: 'Test Grant', applicationWindow: CLOSED })
    request.yar.get.mockReturnValue({ 'other-grant': 'Other Grant' })

    resolveApplicationWindowClosedPath(request, { state: {} })

    expect(request.yar.set).toHaveBeenCalledWith('applicationWindowClosedSchemeName', {
      'other-grant': 'Other Grant',
      'test-grant': 'Test Grant'
    })
  })

  it('returns null when already on the application-window-closed page', () => {
    const request = buildRequest({
      path: '/test-grant/application-window-closed',
      applicationWindow: CLOSED
    })
    const context = { state: {} }

    const result = resolveApplicationWindowClosedPath(request, context)

    expect(result).toBeNull()
    expect(request.yar.set).not.toHaveBeenCalled()
  })
})
