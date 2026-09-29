import { describe, expect, test, vi, beforeEach } from 'vitest'
import { applicationDeletedRedirect } from './redirects/application-deleted-redirect.js'
import { resolveApplicationWindowClosedPath } from './redirects/application-window-closed-redirect.js'
import { formsRequestPipeline } from './forms-request-pipeline.js'
import { enforcePagePermission } from './permissions/enforce-page-permission.js'
import { formsStatusRedirect } from './redirects/forms-status-redirect.js'

vi.mock('./redirects/application-deleted-redirect.js', () => ({
  applicationDeletedRedirect: vi.fn()
}))

vi.mock('./redirects/application-window-closed-redirect.js', () => ({
  resolveApplicationWindowClosedPath: vi.fn()
}))

vi.mock('./permissions/enforce-page-permission.js', () => ({
  enforcePagePermission: vi.fn()
}))

vi.mock('~/src/server/common/request-pipeline/redirects/forms-status-redirect.js', () => ({
  formsStatusRedirect: vi.fn()
}))

describe('formsRequestPipeline', () => {
  const request = /** @type {any} */ ({})
  const context = /** @type {any} */ ({})

  const h = {
    continue: Symbol('continue'),
    redirect: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(applicationDeletedRedirect).mockResolvedValue(h.continue)
    vi.mocked(resolveApplicationWindowClosedPath).mockReturnValue(null)
  })

  test('returns deleted redirect when applicationDeletedRedirect does not continue', async () => {
    const redirectResponse = { statusCode: 302 }
    vi.mocked(applicationDeletedRedirect).mockResolvedValue(redirectResponse)

    const result = await formsRequestPipeline(request, h, context)

    expect(applicationDeletedRedirect).toHaveBeenCalledWith(request, h, context)

    expect(resolveApplicationWindowClosedPath).not.toHaveBeenCalled()
    expect(formsStatusRedirect).not.toHaveBeenCalled()
    expect(enforcePagePermission).not.toHaveBeenCalled()
    expect(result).toBe(redirectResponse)
  })

  test('redirects to the window closed path when resolveApplicationWindowClosedPath returns one', async () => {
    const redirectResponse = { statusCode: 302 }
    h.redirect.mockReturnValueOnce({ takeover: () => redirectResponse })
    vi.mocked(resolveApplicationWindowClosedPath).mockReturnValue('/test-grant/application-window-closed')

    const result = await formsRequestPipeline(request, h, context)

    expect(resolveApplicationWindowClosedPath).toHaveBeenCalledWith(request, context)
    expect(h.redirect).toHaveBeenCalledWith('/test-grant/application-window-closed')
    expect(formsStatusRedirect).not.toHaveBeenCalled()
    expect(enforcePagePermission).not.toHaveBeenCalled()
    expect(result).toBe(redirectResponse)
  })

  test('calls status redirect once the earlier pipeline steps continue', async () => {
    vi.mocked(formsStatusRedirect).mockResolvedValue({ statusCode: 302 })

    await formsRequestPipeline(request, h, context)

    expect(applicationDeletedRedirect).toHaveBeenCalledWith(request, h, context)
    expect(resolveApplicationWindowClosedPath).toHaveBeenCalledWith(request, context)
    expect(formsStatusRedirect).toHaveBeenCalledWith(request, h, context)
  })

  test('returns redirect result when status redirect does not continue', async () => {
    const redirectResponse = {
      statusCode: 302
    }
    vi.mocked(formsStatusRedirect).mockResolvedValue(redirectResponse)

    const result = await formsRequestPipeline(request, h, context)

    expect(formsStatusRedirect).toHaveBeenCalledWith(request, h, context)
    expect(enforcePagePermission).not.toHaveBeenCalled()
    expect(result).toBe(redirectResponse)
  })

  test('enforces permissions after status redirect continues', async () => {
    const forbiddenResponse = {
      statusCode: 403
    }

    vi.mocked(formsStatusRedirect).mockResolvedValue(h.continue)
    vi.mocked(enforcePagePermission).mockResolvedValue(forbiddenResponse)

    const result = await formsRequestPipeline(request, h, context)

    expect(formsStatusRedirect).toHaveBeenCalledWith(request, h, context)
    expect(enforcePagePermission).toHaveBeenCalledWith(request, h, context)
    expect(result).toBe(forbiddenResponse)
  })
})
