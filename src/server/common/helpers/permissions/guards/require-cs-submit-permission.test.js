import { describe, test, expect, vi, beforeEach } from 'vitest'

const mockRequirePermission = vi.fn((config) => config)

vi.mock('./require-permission.js', () => ({
  permissionPaths: {
    cannotSubmit: '/cannot-submit'
  },
  requirePermission: mockRequirePermission
}))

vi.mock('../countryside-stewardship.permissions.js', () => ({
  canSubmitCsApplication: vi.fn()
}))

describe('requireSubmitCsApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  test('configures requirePermission correctly', async () => {
    await import('./require-cs-submit-permission.js')

    expect(mockRequirePermission).toHaveBeenCalledWith({
      hasPermission: expect.any(Function),
      onFail: expect.any(Function)
    })
  })

  test('redirects to cannot-submit without returnUrl', async () => {
    await import('./require-cs-submit-permission.js')

    const config = mockRequirePermission.mock.calls.at(-1)[0]

    const takeover = vi.fn().mockReturnValue('taken-over')

    const h = {
      redirect: vi.fn().mockReturnValue({
        takeover
      })
    }

    const result = config.onFail({}, h, {})

    expect(h.redirect).toHaveBeenCalledWith('/cannot-submit')
    expect(takeover).toHaveBeenCalled()
    expect(result).toBe('taken-over')
  })

  test('redirects with encoded returnUrl when provided', async () => {
    await import('./require-cs-submit-permission.js')

    const config = mockRequirePermission.mock.calls.at(-1)[0]

    const takeover = vi.fn().mockReturnValue('taken-over')

    const h = {
      redirect: vi.fn().mockReturnValue({
        takeover
      })
    }

    const result = config.onFail({}, h, {
      returnUrl: '/task-list?foo=bar&baz=1'
    })

    expect(h.redirect).toHaveBeenCalledWith('/cannot-submit?returnUrl=%2Ftask-list%3Ffoo%3Dbar%26baz%3D1')

    expect(takeover).toHaveBeenCalled()
    expect(result).toBe('taken-over')
  })
})
