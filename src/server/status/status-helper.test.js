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
vi.mock('../../config/agreements.js', () => ({
  default: {
    get: vi.fn().mockReturnValue('/agreement')
  }
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
      app: {
        model: {
          def: {
            metadata: {
              submission: { grantCode: 'grant-a-code' },
              grantRedirectRules: {
                preSubmission: [{ toPath: '/check-selected-land-actions' }],
                postSubmission: [
                  {
                    fromGrantsStatus: 'SUBMITTED,REOPENED',
                    gasStatus: 'APPLICATION_WITHDRAWN',
                    toGrantsStatus: 'CLEARED',
                    toPath: '/start'
                  },

                  // Awaiting amendments
                  {
                    fromGrantsStatus: 'SUBMITTED',
                    gasStatus: 'AWAITING_AMENDMENTS',
                    toGrantsStatus: 'REOPENED',
                    toPath: '/summary'
                  },

                  // Offer sent, withdrawn, accepted -> agreements service

                  {
                    fromGrantsStatus: 'SUBMITTED',
                    gasStatus: 'OFFER_SENT,OFFER_WITHDRAWN,OFFER_ACCEPTED',
                    toGrantsStatus: 'SUBMITTED',
                    toPath: '/agreement'
                  },

                  // Reopened
                  {
                    fromGrantsStatus: 'REOPENED',
                    gasStatus: 'default',
                    toGrantsStatus: 'REOPENED',
                    toPath: '/summary'
                  },

                  {
                    fromGrantsStatus: 'SUBMITTED',
                    gasStatus: 'OFFER_SENT,OFFER_WITHDRAWN,OFFER_ACCEPTED',
                    toGrantsStatus: 'SUBMITTED',
                    toPath: '/agreement'
                  },

                  // Submitted -> confirmation (default for most GAS statuses)
                  {
                    fromGrantsStatus: 'SUBMITTED',
                    gasStatus: 'default',
                    toGrantsStatus: 'SUBMITTED',
                    toPath: '/confirmation'
                  },

                  // Default fallback
                  {
                    fromGrantsStatus: 'default',
                    gasStatus: 'default',
                    toGrantsStatus: 'SUBMITTED',
                    toPath: '/confirmation'
                  }
                ]
              }
            }
          }
        }
      },
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

  it('uses default when redirect rule has no fromGrantsStatus or gasStatus', async () => {
    request.app.model.def.metadata.grantRedirectRules.postSubmission = [
      { toGrantsStatus: 'SUBMITTED', toPath: '/confirmation' }
    ]

    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'RECEIVED' })
    })

    const result = await formsStatusCallback(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
    expect(result).toEqual(expect.any(Symbol))
  })

  it('throws an error if grantCode is missing', async () => {
    delete request.app.model.def.metadata.submission.grantCode

    await expect(formsStatusCallback(request, h, context)).rejects.toThrow(
      'grantCode missing from request.app.model.def.metadata.submission'
    )
  })

  it('throws when no redirect rule matches the combination', async () => {
    request.app.model.def.metadata.grantRedirectRules.postSubmission = [
      { fromGrantsStatus: 'SUBMITTED', gasStatus: 'KNOWN_STATUS', toPath: '/known' }
    ]

    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'UNEXPECTED_STATUS' })
    })

    await expect(formsStatusCallback(request, h, context)).rejects.toThrow(/No redirect rule found/)
  })

  it('returns false when slug is missing', async () => {
    request.params.slug = undefined
    const result = await formsStatusCallback(request, h, context)
    expect(result).toBe(h.continue)
  })

  it('returns false when startPath missing in context', async () => {
    const badContext = { referenceNumber: 'REF-005', state: { someField: 'val' } }
    const result = await formsStatusCallback(request, h, badContext)
    expect(result).toBe(h.continue)
  })

  it('continues when no slug is present', async () => {
    request.params = {}
    const result = await formsStatusCallback(request, h, context)
    expect(result).toBe(h.continue)
  })

  it.each([
    { description: 'no previous status', state: { someFiled: 'someValue' } },
    {
      description: 'previous status is CLEARED',
      state: { applicationStatus: ApplicationStatus.CLEARED, someFiled: 'someValue' }
    },
    {
      description: 'previous status is REOPENED',
      state: { applicationStatus: ApplicationStatus.REOPENED, someFiled: 'someValue' }
    }
  ])(
    'redirects to preSubmission path if $description and has meaningful state and is requesting forms startPage while not being a task list page',
    async ({ state }) => {
      const preSubmissionContext = {
        referenceNumber: 'REF-002',
        state,
        paths: ['/start']
      }

      const result = await formsStatusCallback(request, h, preSubmissionContext)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/check-selected-land-actions')
      expect(result).toEqual(expect.any(Symbol))
    }
  )

  it('continues when state has no meaningful keys', async () => {
    const noMeaningfulContext = {
      referenceNumber: 'REF-003',
      state: { $$__referenceNumber: 'REF-003', applicationStatus: 'CLEARED' },
      paths: ['/start']
    }

    const result = await formsStatusCallback(request, h, noMeaningfulContext)
    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('continues when tasklist page is detected', async () => {
    request.app.model.def.metadata.tasklistId = 'tasklist-1'
    const preSubmissionContext = {
      referenceNumber: 'REF-004',
      state: { someField: 'someValue' },
      paths: ['/start']
    }

    const result = await formsStatusCallback(request, h, preSubmissionContext)
    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('continues when previousStatus is SUBMITTED and no redirect needed', async () => {
    getApplicationStatus.mockResolvedValue({ json: async () => ({ status: 'RECEIVED' }) })
    request.path = '/grant-a/confirmation'

    const result = await formsStatusCallback(request, h, context)
    expect(result).toBe(h.continue)
  })

  it.each([undefined, 'REOPENED', 'CLEARED'])(
    'continues without GAS call when status = %s and no saved state',
    async (status) => {
      context.state = {
        applicationStatus: status
      }
      const result = await formsStatusCallback(request, h, context)
      expect(result).toBe(h.continue)
      expect(getApplicationStatus).not.toHaveBeenCalled()
    }
  )

  it.each([undefined, 'REOPENED', 'CLEARED'])(
    'redirects to "check answers" page if some saved state',
    async (status) => {
      context.state = {
        applicationStatus: status,
        question: 'answer'
      }
      await formsStatusCallback(request, h, context)
      expect(h.redirect).toBeCalled()
      expect(getApplicationStatus).not.toHaveBeenCalled()
    }
  )

  it('sets CLEARED state when GAS returns APPLICATION_WITHDRAWN from SUBMITTED grant status', async () => {
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

  it('continues when GAS returns APPLICATION_WITHDRAWN but previousStatus is neither SUBMITTED nor REOPENED', async () => {
    context.state.applicationStatus = ApplicationStatus.CLEARED
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'APPLICATION_WITHDRAWN' })
    })
    const result = await formsStatusCallback(request, h, context)
    expect(result).toBe(h.continue)
  })

  it('updates status to REOPENED when awaiting amendments and previous is SUBMITTED', async () => {
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'AWAITING_AMENDMENTS' })
    })

    await formsStatusCallback(request, h, context)

    expect(updateApplicationStatus).toHaveBeenCalledWith('REOPENED', '12345:grant-a')
  })

  it('continues when gasStatus is AWAITING_AMENDMENTS and previousStatus is REOPENED', async () => {
    context.state.applicationStatus = ApplicationStatus.REOPENED
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

  it('uses custom postSubmission redirect rule when available', async () => {
    const customRules = [
      { fromGrantsStatus: 'SUBMITTED', gasStatus: 'RECEIVED', toPath: '/custom-path' },
      { fromGrantsStatus: 'default', gasStatus: 'default', toPath: '/fallback-path' }
    ]

    // Override grantRedirectRules in request
    request.app.model.def.metadata.grantRedirectRules.postSubmission = customRules

    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'RECEIVED' })
    })

    const result = await formsStatusCallback(request, h, context)

    // It should pick the custom path instead of default /confirmation
    expect(h.redirect).toHaveBeenCalledWith('/grant-a/custom-path')
    expect(result).toEqual(expect.any(Symbol))
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

  it('uses default redirect when GAS status is unknown', async () => {
    getApplicationStatus.mockResolvedValue({
      json: async () => ({ status: 'SOMETHING_NEW' })
    })

    const result = await formsStatusCallback(request, h, context)
    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
    expect(result).toEqual(expect.any(Symbol))
  })

  describe('farm-payments agreements service redirect', () => {
    it.each(['OFFER_SENT', 'OFFER_WITHDRAWN', 'OFFER_ACCEPTED'])(
      'redirects farm-payments to /agreement when GAS status is %s',
      async (gasStatus) => {
        getApplicationStatus.mockResolvedValue({
          json: async () => ({ status: gasStatus })
        })

        const result = await formsStatusCallback(request, h, context)

        expect(h.redirect).toHaveBeenCalledWith('/agreement')
        expect(result).toEqual(expect.any(Symbol))
      }
    )

    it('does not redirect farm-payments to /agreement when GAS status is RECEIVED', async () => {
      getApplicationStatus.mockResolvedValue({
        json: async () => ({ status: 'RECEIVED' })
      })

      const result = await formsStatusCallback(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
      expect(result).toEqual(expect.any(Symbol))
    })

    it('continues when farm-payments request path is already /agreement', async () => {
      request.path = '/agreement'
      getApplicationStatus.mockResolvedValue({
        json: async () => ({ status: 'OFFER_SENT' })
      })

      const result = await formsStatusCallback(request, h, context)
      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })
  })
})
