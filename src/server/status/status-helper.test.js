import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getApplicationStatus } from '../common/services/grant-application/grant-application.service.js'
import { updateApplicationStatus } from '../common/helpers/status/update-application-status-helper.js'
import { getFormsCacheService } from '../common/helpers/forms-cache/forms-cache.js'
import { ApplicationStatus } from '../common/constants/application-status.js'
import { formsStatusCallback } from './status-helper.js'
import { log, LogCodes } from '../common/helpers/logging/log.js'

vi.mock('../common/helpers/logging/log.js', () => ({
  log: vi.fn(),
  LogCodes: {
    SUBMISSION: {
      SUBMISSION_REDIRECT_FAILURE: { level: 'error', messageFunc: vi.fn() }
    }
  }
}))
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
      app: { model: { def: { metadata: { submission: { grantCode: 'grant-a-code' } } } } },
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
      paths: ['/start', '/confirmation'],
      referenceNumber: 'REF-001',
      state: { applicationStatus: 'SUBMITTED' }
    }
  })

  it('continues when no slug is present', async () => {
    request.params = {}
    const result = await formsStatusCallback(request, h, context)
    expect(result).toBe(h.continue)
  })

  it.each(['REOPENED', 'CLEARED'])('continues without GAS call when status = %s and no saved state', async (status) => {
    context.state = {
      applicationStatus: status
    }
    const result = await formsStatusCallback(request, h, context)
    expect(result).toBe(h.continue)
    expect(getApplicationStatus).not.toHaveBeenCalled()
  })

  it.each(['REOPENED', 'CLEARED'])('redirects to "check answers" page if some saved state', async (status) => {
    context.state = {
      applicationStatus: status,
      question: 'answer'
    }
    await formsStatusCallback(request, h, context)
    expect(h.redirect).toBeCalled()
    expect(getApplicationStatus).not.toHaveBeenCalled()
  })

  it('sets CLEARED state when GAS returns APPLICATION_WITHDRAWN', async () => {
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'APPLICATION_WITHDRAWN' })
    })

    const result = await formsStatusCallback(request, h, context)

    expect(mockCacheService.setState).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        applicationStatus: ApplicationStatus.CLEARED
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

    expect(log).toHaveBeenCalledWith(
      LogCodes.SUBMISSION.SUBMISSION_REDIRECT_FAILURE,
      expect.objectContaining({
        grantType: 'grant-a-code',
        referenceNumber: 'REF-001',
        error: error.message
      })
    )
    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
    expect(result).toEqual(expect.any(Symbol))
  })

  it('continues when non-404 error occurs but path equals fallback URL', async () => {
    const error = new Error('server error')
    getApplicationStatus.mockRejectedValue(error)
    request.path = '/grant-a/confirmation'

    const result = await formsStatusCallback(request, h, context)

    expect(log).toHaveBeenCalledWith(
      LogCodes.SUBMISSION.SUBMISSION_REDIRECT_FAILURE,
      expect.objectContaining({
        grantType: 'grant-a-code',
        referenceNumber: 'REF-001',
        error: error.message
      })
    )
    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('updates status to SUBMITTED and redirects when GAS status is OFFER_SENT', async () => {
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'OFFER_SENT' })
    })

    const result = await formsStatusCallback(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
    expect(result).toEqual(expect.any(Symbol))
  })

  it('uses default redirect when GAS status is unknown', async () => {
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'SOMETHING_NEW' })
    })

    const result = await formsStatusCallback(request, h, context)
    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
    expect(result).toEqual(expect.any(Symbol))
  })
})
