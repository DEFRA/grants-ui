import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getApplicationStatus } from '../../services/grant-application/grant-application.service.js'
import { updateApplicationStatus } from '../../helpers/status/update-application-status-helper.js'
import { ApplicationStatus } from '../../constants/application-status.js'
import { YarKeys } from '../../constants/session-keys.js'
import { formsStatusRedirect, resolveClientReference } from './forms-status-redirect.js'
import { log, LogCodes } from '../../helpers/logging/log.js'
import { setupRedirectTest, mockGasStatus } from './forms-status-redirect.test-helpers.js'

vi.mock('../../../common/helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})
vi.mock('../../../common/services/grant-application/grant-application.service.js', () => ({
  getApplicationStatus: vi.fn()
}))
vi.mock('../../../common/helpers/status/update-application-status-helper.js', () => ({
  updateApplicationStatus: vi.fn()
}))
vi.mock('../../../common/helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: vi.fn()
}))
vi.mock('../../../common/helpers/lock/lock-token.js', () => ({
  mintLockToken: vi.fn().mockReturnValue('mock-lock-token')
}))
vi.mock('../../../common/helpers/state/get-cache-key-helper.js', () => ({
  getCacheKey: vi.fn().mockReturnValue({ sbi: '12345', grantCode: 'grant-a' })
}))
vi.mock('../../../../config/agreements.js', () => ({
  default: {
    get: vi.fn().mockReturnValue('/agreement')
  }
}))

describe('formsStatusRedirect', () => {
  let request
  let h
  let context
  let mockCacheService

  beforeEach(() => {
    ;({ request, h, context, mockCacheService } = setupRedirectTest())
  })

  describe('resolveClientReference', () => {
    it('returns previous reference when status is REOPENED', () => {
      const result = resolveClientReference(ApplicationStatus.REOPENED, {
        referenceNumber: 'NEW',
        state: { previousReferenceNumber: 'OLD' }
      })

      expect(result).toBe('OLD')
    })

    it('returns current reference when not reopened', () => {
      const result = resolveClientReference(ApplicationStatus.SUBMITTED, {
        referenceNumber: 'NEW',
        state: { previousReferenceNumber: 'OLD' }
      })

      expect(result).toBe('NEW')
    })
  })

  it('calls GAS with previous reference for reopened applications awaiting amendments', async () => {
    context.state = {
      applicationStatus: ApplicationStatus.REOPENED,
      previousReferenceNumber: 'OLD-REF-1'
    }

    mockGasStatus('APPLICATION_AMEND')

    await formsStatusRedirect(request, h, context)

    expect(getApplicationStatus).toHaveBeenCalledWith('grant-a', 'old-ref-1', request)
  })

  it('converts reference number to lowercase when calling getApplicationStatus', async () => {
    context.referenceNumber = '89B-AEC-5A6'
    mockGasStatus('RECEIVED')

    await formsStatusRedirect(request, h, context)

    expect(getApplicationStatus).toHaveBeenCalledWith('grant-a', '89b-aec-5a6', request)
  })

  it('redirects when newStatus path differs from current path', async () => {
    mockGasStatus('RECEIVED')

    await formsStatusRedirect(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
  })

  it('continues when request path matches redirect path', async () => {
    request.path = '/grant-a/confirmation'
    mockGasStatus('RECEIVED')

    const result = await formsStatusRedirect(request, h, context)
    expect(result).toBe(h.continue)
  })

  it('uses custom postSubmission redirect rule when available', async () => {
    const customRules = [
      { fromGrantsStatus: 'SUBMITTED', gasStatus: 'RECEIVED', toPath: '/custom-path' },
      { fromGrantsStatus: 'default', gasStatus: 'default', toPath: '/fallback-path' }
    ]

    request.app.model.def.metadata.grantRedirectRules.postSubmission = customRules

    mockGasStatus('RECEIVED')

    await formsStatusRedirect(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/grant-a/custom-path')
  })

  it('continues when getApplicationStatus throws 404', async () => {
    const error = new Error('not found')
    error.status = 404
    getApplicationStatus.mockRejectedValue(error)

    const result = await formsStatusRedirect(request, h, context)
    expect(result).toBe(h.continue)
  })

  it('redirects to fallback and logs on unexpected error', async () => {
    const error = new Error('server error')
    getApplicationStatus.mockRejectedValue(error)

    await formsStatusRedirect(request, h, context)

    expect(log).toHaveBeenCalledWith(
      LogCodes.SUBMISSION.SUBMISSION_REDIRECT_FAILURE,
      expect.objectContaining({
        grantType: 'grant-a',
        referenceNumber: 'REF-001',
        errorMessage: error.message
      }),
      request
    )
    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
  })

  it('continues when non-404 error occurs but path equals fallback URL', async () => {
    const error = new Error('server error')
    getApplicationStatus.mockRejectedValue(error)
    request.path = '/grant-a/confirmation'

    const result = await formsStatusRedirect(request, h, context)

    expect(log).toHaveBeenCalledWith(
      LogCodes.SUBMISSION.SUBMISSION_REDIRECT_FAILURE,
      expect.objectContaining({
        grantType: 'grant-a',
        referenceNumber: 'REF-001',
        errorMessage: error.message
      }),
      request
    )
    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('uses default redirect when GAS status is unknown', async () => {
    mockGasStatus('SOMETHING_NEW')

    await formsStatusRedirect(request, h, context)
    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
  })

  it('continues when checkDetailsChangesPending is true and startPage is /check-details', async () => {
    request.app.model.def.startPage = '/check-details'
    context.state = { applicationStatus: 'SUBMITTED', checkDetailsChangesPending: true }

    const result = await formsStatusRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
    expect(getApplicationStatus).not.toHaveBeenCalled()
  })

  it('does not short-circuit when checkDetailsChangesPending is true but startPage is not /check-details', async () => {
    request.app.model.def.startPage = '/start'
    context.state = { applicationStatus: 'SUBMITTED', checkDetailsChangesPending: true }

    mockGasStatus('RECEIVED')

    const result = await formsStatusRedirect(request, h, context)

    expect(getApplicationStatus).toHaveBeenCalled()
    expect(result).not.toBe(h.continue)
  })

  // Back links on /tasks and /update-details both point at /check-details. Redirecting a
  // same-origin GET there would trap the user on the terminal page they came from (TGC-1484).
  it('continues on a same-origin GET to a check-details start page mid-journey', async () => {
    request.app.model.def.startPage = '/check-details'
    request.app.model.def.metadata.grantRedirectRules.preSubmission = [{ toPath: '/tasks' }]
    request.path = '/grant-a/check-details'
    request.method = 'get'
    request.headers = { 'sec-fetch-site': 'same-origin' }
    context = {
      referenceNumber: 'REF-006',
      paths: ['/check-details'],
      state: { businessDetailsUpToDate: false }
    }

    const result = await formsStatusRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('continues without redirect when current path is in excludedPaths', async () => {
    request.app.model.def.metadata.grantRedirectRules.excludedPaths = ['excluded-path', 'other-excluded-path']
    request.params.path = 'excluded-path'

    context.state = { applicationStatus: 'SUBMITTED', someField: 'someValue' }

    const result = await formsStatusRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
    expect(getApplicationStatus).not.toHaveBeenCalled()
  })

  describe('stateGuards', () => {
    const stateGuardRule = {
      stateKey: 'additionalAnswers.applicant',
      allowedPaths: ['confirm-farm-details'],
      redirectTo: '/confirm-farm-details'
    }

    it('redirects to guard path when required state key is missing and path is not allowed', async () => {
      request.app.model.def.metadata.grantRedirectRules.stateGuards = [stateGuardRule]
      request.params.path = 'confirm-you-will-be-eligible'
      context.state = { applicationStatus: undefined }

      await formsStatusRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirm-farm-details')
    })

    it('continues when on an allowed path even if state key is missing', async () => {
      request.app.model.def.metadata.grantRedirectRules.stateGuards = [stateGuardRule]
      request.params.path = 'confirm-farm-details'
      context.state = { applicationStatus: undefined }

      const result = await formsStatusRedirect(request, h, context)

      expect(result).toBe(h.continue)
    })

    it('continues when required state key is present', async () => {
      request.app.model.def.metadata.grantRedirectRules.stateGuards = [stateGuardRule]
      request.params.path = 'confirm-you-will-be-eligible'
      context.state = { applicationStatus: undefined, additionalAnswers: { applicant: { name: 'Test' } } }

      const result = await formsStatusRedirect(request, h, context)

      expect(result).toBe(h.continue)
    })

    it('continues when no stateGuards are configured', async () => {
      request.params.path = 'confirm-you-will-be-eligible'
      context.state = { applicationStatus: undefined }

      const result = await formsStatusRedirect(request, h, context)

      expect(result).toBe(h.continue)
    })

    it('redirects to guard path when state key is null', async () => {
      request.app.model.def.metadata.grantRedirectRules.stateGuards = [stateGuardRule]
      request.params.path = 'select-land-parcel'
      context.state = { applicationStatus: ApplicationStatus.CLEARED, additionalAnswers: { applicant: null } }

      await formsStatusRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirm-farm-details')
    })
  })

  describe('post-submission protected routes', () => {
    it.each([
      ['confirmation', undefined],
      ['confirmation', ApplicationStatus.CLEARED],
      ['confirmation', ApplicationStatus.REOPENED],
      ['print-submitted-application', undefined],
      ['print-submitted-application', ApplicationStatus.CLEARED],
      ['print-submitted-application', ApplicationStatus.REOPENED]
    ])('rejects direct access to %s when application status is %s', async (path, applicationStatus) => {
      request.params.path = path
      request.path = `/grant-a/${path}`
      request.headers = { 'sec-fetch-site': 'same-origin' }
      request.app.model.def.metadata.grantRedirectRules.excludedPaths = [path]
      context.state = { applicationStatus }

      await expect(formsStatusRedirect(request, h, context)).rejects.toHaveProperty('output.statusCode', 403)

      expect(h.redirect).not.toHaveBeenCalled()
      expect(getApplicationStatus).not.toHaveBeenCalled()
      expect(updateApplicationStatus).not.toHaveBeenCalled()
      expect(mockCacheService.setState).not.toHaveBeenCalled()
      expect(request.yar.set).not.toHaveBeenCalled()
    })

    it('allows direct access to confirmation when the application is submitted', async () => {
      request.params.path = 'confirmation'
      request.path = '/grant-a/confirmation'

      mockGasStatus('RECEIVED')

      const result = await formsStatusRedirect(request, h, context)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('allows direct access to print submitted application when the application is submitted', async () => {
      request.params.path = 'print-submitted-application'
      request.path = '/grant-a/print-submitted-application'
      request.app.model.def.metadata.grantRedirectRules.excludedPaths = ['print-submitted-application']
      context.state = { applicationStatus: ApplicationStatus.SUBMITTED }

      const result = await formsStatusRedirect(request, h, context)

      expect(result).toBe(h.continue)
      expect(getApplicationStatus).not.toHaveBeenCalled()
      expect(h.redirect).not.toHaveBeenCalled()
    })
  })

  describe('farm-payments agreements service redirect', () => {
    it.each(['OFFER_SENT', 'OFFER_WITHDRAWN', 'OFFER_ACCEPTED'])(
      'redirects farm-payments to /agreement when GAS status is %s',
      async (gasStatus) => {
        mockGasStatus(gasStatus)

        await formsStatusRedirect(request, h, context)

        expect(h.redirect).toHaveBeenCalledWith('/agreement')
        expect(request.yar.set).toHaveBeenCalledWith(YarKeys.GRANT_APPLICATION_CONTEXT, {
          grantCode: 'grant-a',
          grantVersion: '1.0.0',
          clientRef: 'ref-001',
          sbi: '12345'
        })
      }
    )

    it('does not redirect farm-payments to /agreement when GAS status is RECEIVED', async () => {
      mockGasStatus('RECEIVED')

      await formsStatusRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
    })

    it('continues when farm-payments request path is already /agreement', async () => {
      request.path = '/agreement'
      mockGasStatus('OFFER_SENT')

      const result = await formsStatusRedirect(request, h, context)
      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })
  })
})
