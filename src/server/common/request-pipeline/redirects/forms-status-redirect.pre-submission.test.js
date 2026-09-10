import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getApplicationStatus } from '../../services/grant-application/grant-application.service.js'
import { updateApplicationStatus } from '../../helpers/status/update-application-status-helper.js'
import { ApplicationStatus } from '../../constants/application-status.js'
import { formsStatusRedirect } from './forms-status-redirect.js'
import { mintLockToken } from '../../helpers/lock/lock-token.js'
import { getCacheKey } from '../../helpers/state/get-cache-key-helper.js'
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

  it('uses default when redirect rule has no fromGrantsStatus or gasStatus', async () => {
    request.app.model.def.metadata.grantRedirectRules.postSubmission = [
      { toGrantsStatus: 'SUBMITTED', toPath: '/confirmation' }
    ]

    mockGasStatus('RECEIVED')

    await formsStatusRedirect(request, h, context)

    expect(h.redirect).toHaveBeenCalledWith('/grant-a/confirmation')
  })

  it('throws when no redirect rule matches the combination', async () => {
    request.app.model.def.metadata.grantRedirectRules.postSubmission = [
      { fromGrantsStatus: 'SUBMITTED', gasStatus: 'KNOWN_STATUS', toPath: '/known' }
    ]

    mockGasStatus('UNEXPECTED_STATUS')

    await expect(formsStatusRedirect(request, h, context)).rejects.toThrow(/No redirect rule found/)
  })

  it('continues when startPath is missing from context', async () => {
    const badContext = { referenceNumber: 'REF-005', state: { someField: 'val' } }
    const result = await formsStatusRedirect(request, h, badContext)
    expect(result).toBe(h.continue)
  })

  it('continues when no slug is present', async () => {
    request.params = {}
    const result = await formsStatusRedirect(request, h, context)
    expect(result).toBe(h.continue)
  })

  it.each([
    { description: 'no previous status', state: { someFiled: 'someValue' } },
    {
      description: 'previous status is CLEARED',
      state: { applicationStatus: ApplicationStatus.CLEARED, someFiled: 'someValue' }
    }
  ])(
    'redirects to preSubmission path if $description and has meaningful state and is requesting forms startPage while not being a task list page',
    async ({ state }) => {
      const preSubmissionContext = {
        referenceNumber: 'REF-002',
        state,
        paths: ['/start']
      }

      await formsStatusRedirect(request, h, preSubmissionContext)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/check-selected-land-actions')
    }
  )

  it('continues when state has no meaningful keys', async () => {
    const noMeaningfulContext = {
      referenceNumber: 'REF-003',
      state: { $$__referenceNumber: 'REF-003', applicationStatus: 'CLEARED' },
      paths: ['/start']
    }

    const result = await formsStatusRedirect(request, h, noMeaningfulContext)
    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('redirects when state has landParcels with keys (meaningful state)', async () => {
    const contextWithLandParcels = {
      referenceNumber: 'REF-004',
      state: { applicationStatus: 'CLEARED', landParcels: { parcel1: 'data' } },
      paths: ['/start']
    }

    await formsStatusRedirect(request, h, contextWithLandParcels)
    expect(h.redirect).toHaveBeenCalled()
  })

  it('continues when the preSubmission destination is the current start page', async () => {
    request.app.model.def.metadata.grantRedirectRules.preSubmission = [{ toPath: '/tasks' }]
    request.path = '/grant-a/tasks'
    context = {
      referenceNumber: 'REF-004',
      state: { applicationStatus: 'CLEARED', firstQuestion: 'saved answer' },
      paths: ['/tasks']
    }

    const result = await formsStatusRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('continues when state has empty landParcels object (not meaningful)', async () => {
    const contextWithEmptyLandParcels = {
      referenceNumber: 'REF-005',
      state: { applicationStatus: 'CLEARED', landParcels: {} },
      paths: ['/start']
    }

    const result = await formsStatusRedirect(request, h, contextWithEmptyLandParcels)
    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  describe('pre-submission requirement gate', () => {
    const gatedPreSubmission = [
      {
        toPath: '/check-selected-land-actions',
        requiresAnyItemWithNonEmptyKey: { collection: 'landParcels', key: 'actionsObj' },
        incompleteToPath: '/select-land-parcel'
      }
    ]

    beforeEach(() => {
      request.app.model.def.metadata.grantRedirectRules.preSubmission = gatedPreSubmission
    })

    it('redirects to the check-answers page when at least one parcel has actions', async () => {
      const contextWithActions = {
        referenceNumber: 'REF-010',
        state: {
          applicationStatus: 'CLEARED',
          landParcels: { 'SD1234-5678': { size: 1, actionsObj: { CSAM1: { value: '1', unit: 'ha' } } } }
        },
        paths: ['/start']
      }

      await formsStatusRedirect(request, h, contextWithActions)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/check-selected-land-actions')
    })

    it('redirects to the select-land-parcel page when the only parcel has no actions', async () => {
      const contextWithoutActions = {
        referenceNumber: 'REF-011',
        state: {
          applicationStatus: 'CLEARED',
          landParcels: { 'SD1234-5678': { size: 1, actionsObj: {} } }
        },
        paths: ['/start']
      }

      await formsStatusRedirect(request, h, contextWithoutActions)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/select-land-parcel')
    })

    it('redirects to the check-answers page when at least one of several parcels has actions', async () => {
      const contextWithMixedParcels = {
        referenceNumber: 'REF-012',
        state: {
          applicationStatus: 'CLEARED',
          landParcels: {
            'SD1234-5678': { size: 1, actionsObj: { CSAM1: { value: '1', unit: 'ha' } } },
            'SD1234-9999': { size: 1, actionsObj: {} }
          }
        },
        paths: ['/start']
      }

      await formsStatusRedirect(request, h, contextWithMixedParcels)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/check-selected-land-actions')
    })

    it('redirects to the select-land-parcel page for the real grasslands state (parcel selected, landParcels cleared to empty)', async () => {
      const contextParcelSelectedNoActions = {
        referenceNumber: 'REF-013b',
        state: {
          applicationStatus: 'CLEARED',
          selectedParcelId: 'SD1234-5678',
          selectedParcelIds: ['SD1234-5678'],
          selectedParcelsDisplay: 'SD1234-5678',
          landParcels: {}
        },
        paths: ['/start']
      }

      await formsStatusRedirect(request, h, contextParcelSelectedNoActions)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/select-land-parcel')
    })

    it('redirects to the select-land-parcel page when parcels are selected but none has actions (array shape)', async () => {
      const contextWithSelectedOnly = {
        referenceNumber: 'REF-013',
        state: {
          applicationStatus: 'CLEARED',
          landParcels: ['SD1234-5678', 'SD1234-9999']
        },
        paths: ['/start']
      }

      await formsStatusRedirect(request, h, contextWithSelectedOnly)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/select-land-parcel')
    })

    it('continues without redirecting when the gate is unmet and no incompleteToPath is configured', async () => {
      request.app.model.def.metadata.grantRedirectRules.preSubmission = [
        {
          toPath: '/check-selected-land-actions',
          requiresAnyItemWithNonEmptyKey: { collection: 'landParcels', key: 'actionsObj' }
        }
      ]
      const contextWithoutActions = {
        referenceNumber: 'REF-014',
        state: {
          applicationStatus: 'CLEARED',
          landParcels: { 'SD1234-5678': { size: 1, actionsObj: {} } }
        },
        paths: ['/start']
      }

      const result = await formsStatusRedirect(request, h, contextWithoutActions)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })
  })

  it.each([undefined, 'CLEARED'])('continues without GAS call when status = %s and no saved state', async (status) => {
    context.state = {
      applicationStatus: status
    }
    const result = await formsStatusRedirect(request, h, context)
    expect(result).toBe(h.continue)
    expect(getApplicationStatus).not.toHaveBeenCalled()
  })

  it('redirects to preSubmission path when toPath does not start with slash', async () => {
    request.app.model.def.metadata.grantRedirectRules.preSubmission = [{ toPath: 'check-selected-land-actions' }]
    const preSubmissionContext = {
      referenceNumber: 'REF-006',
      state: { question: 'answer' },
      paths: ['/start']
    }

    await formsStatusRedirect(request, h, preSubmissionContext)

    expect(h.redirect).toHaveBeenCalledWith('/grant-a/check-selected-land-actions')
  })

  it('continues without redirecting when there is no preSubmission rule configured', async () => {
    request.app.model.def.metadata.grantRedirectRules.preSubmission = []
    context.state = { question: 'answer' }

    const result = await formsStatusRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it.each([undefined, 'CLEARED'])('redirects to "check answers" page if some saved state', async (status) => {
    context.state = {
      applicationStatus: status,
      question: 'answer'
    }
    await formsStatusRedirect(request, h, context)
    expect(h.redirect).toBeCalled()
    expect(getApplicationStatus).not.toHaveBeenCalled()
  })

  it('continues without GAS call when status is an unknown value', async () => {
    context.state = {
      applicationStatus: 'UNKNOWN_STATUS'
    }
    const result = await formsStatusRedirect(request, h, context)

    expect(result).toBe(h.continue)
    expect(getApplicationStatus).not.toHaveBeenCalled()
  })

  it('sets CLEARED state when GAS returns APPLICATION_WITHDRAWN from SUBMITTED grant status', async () => {
    mockGasStatus('APPLICATION_WITHDRAWN')

    const result = await formsStatusRedirect(request, h, context)

    expect(mockCacheService.setState).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        applicationStatus: ApplicationStatus.CLEARED
      })
    )
    // The user is already on the rule's target path (/grant-a/start), so no redirect is issued.
    expect(result).toBe(h.continue)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it('continues when GAS returns APPLICATION_WITHDRAWN but previousStatus is neither SUBMITTED nor REOPENED', async () => {
    context.state.applicationStatus = ApplicationStatus.CLEARED
    mockGasStatus('APPLICATION_WITHDRAWN')
    const result = await formsStatusRedirect(request, h, context)
    expect(result).toBe(h.continue)
  })

  it('updates status to REOPENED and redirects to summary when awaiting amendments and previous is SUBMITTED', async () => {
    mockGasStatus('APPLICATION_AMEND')

    await formsStatusRedirect(request, h, context)

    expect(getCacheKey).toHaveBeenCalledWith(request)
    expect(mintLockToken).toHaveBeenCalledWith({
      userId: 'contact-123',
      sbi: '12345',
      grantCode: 'grant-a',
      grantVersion: '1.0.0'
    })
    expect(updateApplicationStatus).toHaveBeenCalledWith('REOPENED', '12345:grant-a', {
      lockToken: 'mock-lock-token',
      grantVersion: '1.0.0'
    })
    expect(h.redirect).toHaveBeenCalledWith('/grant-a/summary')
  })

  it('throws when no grant version can be resolved for the status update', async () => {
    delete request.app.model.def.metadata.version
    mockGasStatus('APPLICATION_AMEND')

    await formsStatusRedirect(request, h, context)

    // handlePostSubmission fails on the unresolvable version and the error
    // handler falls back to the default redirect rule instead of persisting.
    expect(updateApplicationStatus).not.toHaveBeenCalled()
  })

  it('updates session cache when transitioning to REOPENED', async () => {
    mockGasStatus('APPLICATION_AMEND')

    await formsStatusRedirect(request, h, context)

    expect(mockCacheService.setState).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        applicationStatus: ApplicationStatus.REOPENED
      })
    )
  })

  it('preserves existing form state when transitioning to REOPENED', async () => {
    context.state = {
      applicationStatus: 'SUBMITTED',
      someFormField: 'form-value',
      anotherField: { nested: 'data' }
    }
    mockGasStatus('APPLICATION_AMEND')

    await formsStatusRedirect(request, h, context)

    expect(mockCacheService.setState).toHaveBeenCalledWith(request, {
      applicationStatus: ApplicationStatus.REOPENED,
      someFormField: 'form-value',
      anotherField: { nested: 'data' }
    })
  })

  it('does not preserve existing form state when transitioning to CLEARED (withdrawal)', async () => {
    context.state = {
      applicationStatus: 'SUBMITTED',
      someFormField: 'form-value',
      anotherField: { nested: 'data' }
    }
    mockGasStatus('APPLICATION_WITHDRAWN')

    await formsStatusRedirect(request, h, context)

    expect(mockCacheService.setState).toHaveBeenCalledWith(request, {
      applicationStatus: ApplicationStatus.CLEARED
    })
  })

  it('allows normal navigation when gasStatus is APPLICATION_AMEND and previousStatus is REOPENED and request is same-origin', async () => {
    context.state.applicationStatus = ApplicationStatus.REOPENED
    request.path = '/grant-a/some-question-page'
    request.headers = { 'sec-fetch-site': 'same-origin' }
    mockGasStatus('APPLICATION_AMEND')

    const result = await formsStatusRedirect(request, h, context)
    expect(h.redirect).not.toHaveBeenCalled()
    expect(result).toBe(h.continue)
  })

  it('redirects to summary when gasStatus is APPLICATION_AMEND and previousStatus is REOPENED and request is not same-origin', async () => {
    context.state.applicationStatus = ApplicationStatus.REOPENED
    request.path = '/grant-a/some-question-page'
    request.headers = { 'sec-fetch-site': 'none' }
    mockGasStatus('APPLICATION_AMEND')

    await formsStatusRedirect(request, h, context)
    expect(h.redirect).toHaveBeenCalledWith('/grant-a/summary')
  })

  it('redirects to start when REOPENED application is withdrawn by GAS', async () => {
    context.state.applicationStatus = ApplicationStatus.REOPENED
    request.path = '/grant-a/some-question-page'
    mockGasStatus('APPLICATION_WITHDRAWN')

    await formsStatusRedirect(request, h, context)
    expect(h.redirect).toHaveBeenCalledWith('/grant-a/start')
    expect(mockCacheService.setState).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ applicationStatus: ApplicationStatus.CLEARED })
    )
  })

  it('falls back to current reference when REOPENED but previousReferenceNumber missing', async () => {
    context.state = {
      applicationStatus: ApplicationStatus.REOPENED
    }

    context.referenceNumber = 'REF-NEW-999'

    mockGasStatus('APPLICATION_AMEND')

    await formsStatusRedirect(request, h, context)

    expect(getApplicationStatus).toHaveBeenCalledWith('grant-a', 'ref-new-999', request)
  })
})
