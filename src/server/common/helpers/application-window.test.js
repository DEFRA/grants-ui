import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isApplicationWindowOpen } from './application-window.js'
import { isWindowClosedMockEnabled } from './mock-overrides.js'

vi.mock('./mock-overrides.js', () => ({
  isWindowClosedMockEnabled: vi.fn()
}))

describe('isApplicationWindowOpen', () => {
  const now = new Date('2026-10-01T12:00:00Z')

  const buildRequest = (applicationWindow) => ({
    app: { model: { def: { metadata: { applicationWindow } } } }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isWindowClosedMockEnabled).mockReturnValue(false)
  })

  it.each([
    { label: 'no applicationWindow', applicationWindow: undefined, open: true },
    { label: 'empty applicationWindow', applicationWindow: {}, open: true },
    { label: 'before closesAt', applicationWindow: { closesAt: '2026-10-01T12:00:01Z' }, open: true },
    { label: 'at closesAt', applicationWindow: { closesAt: '2026-10-01T12:00:00Z' }, open: false },
    { label: 'after closesAt', applicationWindow: { closesAt: '2026-09-01T00:00:00Z' }, open: false },
    {
      label: 'offset closesAt already passed',
      applicationWindow: { closesAt: '2026-10-01T12:30:00+01:00' },
      open: false
    }
  ])('is open=$open when $label', ({ applicationWindow, open }) => {
    expect(isApplicationWindowOpen(buildRequest(applicationWindow), now)).toBe(open)
  })

  it('is open when the request has no form model', () => {
    expect(isApplicationWindowOpen({ app: {} }, now)).toBe(true)
  })

  it('is closed when the dev-tools mock is enabled, even inside the window', () => {
    vi.mocked(isWindowClosedMockEnabled).mockReturnValue(true)

    expect(isApplicationWindowOpen(buildRequest({ closesAt: '2026-10-01T12:00:01Z' }), now)).toBe(false)
  })
})
