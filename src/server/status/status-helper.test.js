import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formsStatusCallback } from './status-helper.js'
import { getApplicationStatus } from '../common/services/grant-application/grant-application.service.js'
import { updateApplicationStatus } from '../common/helpers/status/update-application-status-helper.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { ApplicationStatus } from '../common/constants/application-status.js'

vi.mock('../common/services/grant-application/grant-application.service.js', () => ({
  getApplicationStatus: vi.fn()
}))
vi.mock('../common/helpers/status/update-application-status-helper.js', () => ({
  updateApplicationStatus: vi.fn()
}))
vi.mock('../common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: vi.fn()
}))

describe('formsStatusCallback', () => {
  let request
  let h
  let context
  let mockCacheService

  beforeEach(() => {
    vi.clearAllMocks()

    mockCacheService = { setState: vi.fn() }
    getFormsCacheService.mockReturnValue(mockCacheService)

    request = {
      params: { slug: 'grant-a' },
      path: '/grant-a/start',
      auth: { credentials: { sbi: '12345', crn: 'CRN123' } },
      server: { logger: { error: vi.fn() } }
    }

    h = {
      continue: Symbol('continue'),
      redirect: vi.fn().mockReturnValue({
        takeover: vi.fn().mockReturnValue(Symbol('redirected'))
      })
    }

    context = {
      referenceNumber: 'REF-001',
      state: { applicationStatus: 'SUBMITTED' }
    }
  })

  it('continues when no slug is present', async () => {
    request.params = {}
    const result = await formsStatusCallback(request, h, context)
    expect(result).toBe(h.continue)
  })

  it('sets CLEARED state when GAS returns APPLICATION_WITHDRAWN', async () => {
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'APPLICATION_WITHDRAWN' })
    })

    const result = await formsStatusCallback(request, h, context)

    expect(mockCacheService.setState).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        applicationStatus: ApplicationStatus.CLEARED,
        submittedBy: 'CRN123'
      })
    )
    expect(result).toEqual(expect.any(Symbol))
  })

  it('updates status to REOPENED when awaiting amendments and previous is SUBMITTED', async () => {
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'AWAITING_AMENDMENTS' })
    })

    await formsStatusCallback(request, h, context)

    expect(updateApplicationStatus).toHaveBeenCalledWith('REOPENED', '12345:grant-a')
  })

  it('continues when gasStatus is AWAITING_AMENDMENTS and previousStatus is REOPENED', async () => {
    context.state.applicationStatus = 'REOPENED'
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'AWAITING_AMENDMENTS' })
    })

    const result = await formsStatusCallback(request, h, context)
    expect(result).toBe(h.continue)
    expect(updateApplicationStatus).not.toHaveBeenCalled()
  })

  it('redirects when newStatus path differs from current path', async () => {
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'RECEIVED' })
    })

    const result = await formsStatusCallback(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
    expect(result).toEqual(expect.any(Symbol))
  })

  it('continues when request path matches redirect path', async () => {
    request.path = '/grant-a/confirmation'
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'RECEIVED' })
    })

    const result = await formsStatusCallback(request, h, context)
    expect(result).toBe(h.continue)
  })

  it('continues when getApplicationStatus throws 404', async () => {
    const error = new Error('not found')
    error.status = 404
    getApplicationStatus.mockRejectedValue(error)

    const result = await formsStatusCallback(request, h, context)
    expect(result).toBe(h.continue)
  })

  it('redirects to fallback and logs on unexpected error', async () => {
    const error = new Error('server error')
    getApplicationStatus.mockRejectedValue(error)

    const result = await formsStatusCallback(request, h, context)

    expect(request.server.logger.error).toHaveBeenCalledWith(error)
    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
    expect(result).toEqual(expect.any(Symbol))
  })

  it('should continue when a non-404 error occurs but request.path equals fallbackUrl', async () => {
    const fakeError = new Error('Internal failure')
    fakeError.status = 500

    const grantId = 'some-grant'
    const fallbackUrl = `/${grantId}/confirmation`

    const request = {
      params: { slug: grantId },
      path: fallbackUrl, // 👈 equals fallbackUrl
      auth: { credentials: { sbi: 'org123' } },
      server: { logger: { error: vi.fn() } }
    }

    const h = { continue: Symbol('continue'), redirect: vi.fn() }

    // mock getApplicationStatus to throw
    vi.mocked(getApplicationStatus).mockRejectedValue(fakeError)

    const result = await formsStatusCallback(request, h, { state: {} })

    expect(request.server.logger.error).toHaveBeenCalledWith(fakeError)
    expect(result).toBe(h.continue) // 👈 ensure it continues (not redirects)
    expect(h.redirect).not.toHaveBeenCalled()
  })
})
