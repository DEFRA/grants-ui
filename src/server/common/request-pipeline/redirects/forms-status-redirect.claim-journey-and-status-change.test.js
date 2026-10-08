import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getApplicationStatus } from '../../services/grant-application/grant-application.service.js'
import { updateApplicationStatus } from '../../helpers/status/update-application-status-helper.js'
import { ApplicationStatus } from '../../constants/application-status.js'
import { YarKeys } from '../../constants/session-keys.js'
import { formsStatusRedirect } from './forms-status-redirect.js'
import { setupRedirectTest, mockGasStatus } from './forms-status-redirect.test-helpers.js'
import { getCacheKey } from '../../helpers/state/get-cache-key-helper.js'
import { generateUniqueReference } from '@defra/forms-engine-plugin/engine/referenceNumbers.js'
import { isStoredByReference } from '../../helpers/state/state-with-definition-context.js'

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
vi.mock('../../../common/helpers/state/get-cache-key-helper.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCacheKey: vi.fn().mockReturnValue({ sbi: '12345', grantCode: 'grant-a' })
}))
vi.mock('../../../../config/agreements.js', () => ({
  default: {
    get: vi.fn().mockReturnValue('/agreement')
  }
}))
vi.mock('@defra/forms-engine-plugin/engine/referenceNumbers.js', () => ({
  generateUniqueReference: vi.fn((prefix) => `${prefix}-NEW-REF`)
}))
vi.mock('../../helpers/state/state-with-definition-context.js', () => ({
  isStoredByReference: vi.fn().mockResolvedValue(false)
}))

describe('formsStatusRedirect', () => {
  let request
  let h
  let context

  let mockCacheService

  beforeEach(() => {
    ;({ request, h, context, mockCacheService } = setupRedirectTest())
    mockCacheService.clearApplicationState = vi.fn()
  })

  describe('claim journey start-page navigation', () => {
    beforeEach(() => {
      // Mirrors the woodland claim configuration: /claim is the claim journey start page.
      request.app.model.def.metadata.grantRedirectRules.postSubmission = [
        {
          fromGrantsStatus: 'SUBMITTED',
          gasStatus: 'STATUS_AWAITING_CLAIM',
          toGrantsStatus: 'CLAIM_STARTED',
          toPath: '/claim'
        },
        {
          fromGrantsStatus: 'CLAIM_STARTED',
          gasStatus: 'default',
          toGrantsStatus: 'CLAIM_STARTED',
          toPath: '/claim'
        },
        // 2nd and subsequent claims: GAS moving back to STATUS_AWAITING_CLAIM opens the
        // next claim window. This specific rule must precede the CLAIM_SUBMITTED default.
        {
          fromGrantsStatus: 'CLAIM_SUBMITTED',
          gasStatus: 'STATUS_AWAITING_CLAIM',
          toGrantsStatus: 'CLAIM_STARTED',
          toPath: '/claim'
        },
        {
          fromGrantsStatus: 'CLAIM_SUBMITTED',
          gasStatus: 'default',
          toGrantsStatus: 'CLAIM_SUBMITTED',
          toPath: '/claim/submitted'
        },
        {
          fromGrantsStatus: 'default',
          gasStatus: 'default',
          toGrantsStatus: 'SUBMITTED',
          toPath: '/confirmation'
        }
      ]

      // Ordered pages: the claim journey sits after the submitted-application pages.
      request.app.model.def.pages = [
        { path: '/start' },
        { path: '/summary' },
        { path: '/declaration' },
        { path: '/confirmation' },
        { path: '/print-submitted-application' },
        { path: '/claim' },
        { path: '/claim-declaration' },
        { path: '/claim-confirmation' }
      ]

      context.state = { applicationStatus: ApplicationStatus.CLAIM_STARTED }
    })

    it('continues on the claim start page so it acts as the journey start page', async () => {
      request.path = '/grant-a/claim'
      request.params.path = 'claim'

      const result = await formsStatusRedirect(request, h, context)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
      expect(getApplicationStatus).not.toHaveBeenCalled()
    })

    it.each(['claim-declaration', 'claim-confirmation'])(
      'continues on the subsequent claim page %s (normal plugin navigation)',
      async (path) => {
        request.path = `/grant-a/${path}`
        request.params.path = path

        const result = await formsStatusRedirect(request, h, context)

        expect(result).toBe(h.continue)
        expect(h.redirect).not.toHaveBeenCalled()
      }
    )

    it.each(['start', 'summary', 'declaration'])(
      'redirects earlier page %s back to the claim start page',
      async (path) => {
        request.path = `/grant-a/${path}`
        request.params.path = path

        await formsStatusRedirect(request, h, context)

        expect(h.redirect).toHaveBeenCalledWith('/grant-a/claim')
      }
    )

    it('redirects /confirmation to the claim start page instead of forbidding access', async () => {
      request.path = '/grant-a/confirmation'
      request.params.path = 'confirmation'

      await formsStatusRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/claim')
    })

    it('continues on an excluded path without redirecting', async () => {
      request.app.model.def.metadata.grantRedirectRules.excludedPaths = ['print-submitted-application']
      request.path = '/grant-a/print-submitted-application'
      request.params.path = 'print-submitted-application'

      const result = await formsStatusRedirect(request, h, context)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('does not call GAS or persist status while navigating the claim journey', async () => {
      request.path = '/grant-a/claim-declaration'
      request.params.path = 'claim-declaration'

      await formsStatusRedirect(request, h, context)

      expect(getApplicationStatus).not.toHaveBeenCalled()
      expect(updateApplicationStatus).not.toHaveBeenCalled()
    })

    it('stays on the claim start page immediately after the status-change redirect', async () => {
      request.path = '/grant-a/claim'
      request.params.path = 'claim'
      request.yar.get.mockReturnValue('/grant-a/claim')

      const result = await formsStatusRedirect(request, h, context)

      expect(request.yar.clear).toHaveBeenCalledWith(YarKeys.STATUS_CHANGE_REDIRECT)
      expect(result).toBe(h.continue)
    })

    it('redirects CLAIM_SUBMITTED requests to the claim submitted page while GAS has not reopened the claim window', async () => {
      context.state = { applicationStatus: ApplicationStatus.CLAIM_SUBMITTED }
      request.path = '/grant-a/confirmation'
      request.params.path = 'confirmation'
      // GAS is still processing the submitted claim, so no new claim window is open.
      mockGasStatus('RECEIVED')

      await formsStatusRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/claim/submitted')
      expect(updateApplicationStatus).not.toHaveBeenCalled()
      expect(request.yar.set).not.toHaveBeenCalledWith(YarKeys.STATUS_CHANGE_REDIRECT, expect.anything())
    })

    it('opens the next claim window when GAS moves a submitted claim back to STATUS_AWAITING_CLAIM', async () => {
      context.state = { applicationStatus: ApplicationStatus.CLAIM_SUBMITTED }
      request.path = '/grant-a/claim-confirmation'
      request.params.path = 'claim-confirmation'
      mockGasStatus('STATUS_AWAITING_CLAIM')

      await formsStatusRedirect(request, h, context)

      expect(getApplicationStatus).toHaveBeenCalledWith('grant-a', 'ref-001', request)
      expect(updateApplicationStatus).toHaveBeenCalledWith(
        ApplicationStatus.CLAIM_STARTED,
        '12345:grant-a',
        expect.objectContaining({ lockToken: 'mock-lock-token' })
      )
      expect(h.redirect).toHaveBeenCalledWith('/grant-a/claim')
      expect(request.yar.set).toHaveBeenCalledWith(YarKeys.STATUS_CHANGE_REDIRECT, '/grant-a/claim')
    })

    it('persists the next claim transition but continues without a marker when already on the claim start page', async () => {
      context.state = { applicationStatus: ApplicationStatus.CLAIM_SUBMITTED }
      request.path = '/grant-a/claim'
      request.params.path = 'claim'
      mockGasStatus('STATUS_AWAITING_CLAIM')

      const result = await formsStatusRedirect(request, h, context)

      expect(result).toBe(h.continue)
      expect(updateApplicationStatus).toHaveBeenCalledWith(
        ApplicationStatus.CLAIM_STARTED,
        '12345:grant-a',
        expect.objectContaining({ lockToken: 'mock-lock-token' })
      )
      expect(h.redirect).not.toHaveBeenCalled()
      expect(request.yar.set).not.toHaveBeenCalledWith(YarKeys.STATUS_CHANGE_REDIRECT, expect.anything())
    })

    it('keeps the user on the submitted claim page without throwing when GAS is unavailable', async () => {
      context.state = { applicationStatus: ApplicationStatus.CLAIM_SUBMITTED }
      request.path = '/grant-a/confirmation'
      request.params.path = 'confirmation'
      getApplicationStatus.mockRejectedValue(new Error('GAS unavailable'))

      await formsStatusRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/claim/submitted')
      expect(updateApplicationStatus).not.toHaveBeenCalled()
    })
  })

  describe('status change one-shot redirect', () => {
    beforeEach(() => {
      request.app.model.def.metadata.grantRedirectRules.postSubmission = [
        {
          fromGrantsStatus: 'SUBMITTED,REOPENED',
          gasStatus: 'APPLICATION_WITHDRAWN',
          toGrantsStatus: 'CLEARED',
          toPath: '/start'
        },
        {
          fromGrantsStatus: 'SUBMITTED',
          gasStatus: 'APPLICATION_AMEND',
          toGrantsStatus: 'REOPENED',
          toPath: '/reopened'
        },
        {
          fromGrantsStatus: 'REOPENED',
          gasStatus: 'default',
          toGrantsStatus: 'REOPENED',
          toPath: '/summary'
        },
        {
          fromGrantsStatus: 'default',
          gasStatus: 'default',
          toGrantsStatus: 'SUBMITTED',
          toPath: '/confirmation'
        }
      ]
    })

    it('records a one-shot marker and redirects to /reopened when the status changes to REOPENED', async () => {
      mockGasStatus('APPLICATION_AMEND')

      await formsStatusRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/reopened')
      expect(request.yar.set).toHaveBeenCalledWith(YarKeys.STATUS_CHANGE_REDIRECT, '/grant-a/reopened')
    })

    it('stays on /reopened on the request immediately after the status change (does not bounce to /summary)', async () => {
      context.state = { applicationStatus: ApplicationStatus.REOPENED, previousReferenceNumber: 'OLD-REF' }
      request.path = '/grant-a/reopened'
      request.yar.get.mockReturnValue('/grant-a/reopened')
      mockGasStatus('APPLICATION_AMEND')

      const result = await formsStatusRedirect(request, h, context)

      expect(request.yar.clear).toHaveBeenCalledWith(YarKeys.STATUS_CHANGE_REDIRECT)
      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
      expect(getApplicationStatus).not.toHaveBeenCalled()
    })

    it('redirects a returning reopened user to /summary once the marker has been consumed', async () => {
      context.state = { applicationStatus: ApplicationStatus.REOPENED, previousReferenceNumber: 'OLD-REF' }
      request.path = '/grant-a/some-question-page'
      request.headers = { 'sec-fetch-site': 'none' }
      request.yar.get.mockReturnValue(undefined)
      mockGasStatus('APPLICATION_AMEND')

      await formsStatusRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/summary')
    })

    it('clears a stale marker and applies the steady-state rule when the current path differs', async () => {
      context.state = { applicationStatus: ApplicationStatus.REOPENED, previousReferenceNumber: 'OLD-REF' }
      request.path = '/grant-a/some-question-page'
      request.headers = { 'sec-fetch-site': 'none' }
      request.yar.get.mockReturnValue('/grant-a/reopened')
      mockGasStatus('APPLICATION_AMEND')

      await formsStatusRedirect(request, h, context)

      expect(request.yar.clear).toHaveBeenCalledWith(YarKeys.STATUS_CHANGE_REDIRECT)
      expect(h.redirect).toHaveBeenCalledWith('/grant-a/summary')
    })
  })

  describe('persisting a status change', () => {
    beforeEach(() => {
      request.app.model.def.metadata.referenceNumberPrefix = 'GLD'
      request.app.model.def.metadata.grantRedirectRules.postSubmission = [
        {
          fromGrantsStatus: 'SUBMITTED,REOPENED',
          gasStatus: 'APPLICATION_WITHDRAWN',
          toGrantsStatus: 'CLEARED',
          toPath: '/start'
        },
        {
          fromGrantsStatus: 'SUBMITTED',
          gasStatus: 'APPLICATION_AMEND',
          toGrantsStatus: 'REOPENED',
          toPath: '/summary'
        },
        { fromGrantsStatus: 'default', gasStatus: 'default', toGrantsStatus: 'SUBMITTED', toPath: '/confirmation' }
      ]
      context.state = {
        applicationStatus: ApplicationStatus.SUBMITTED,
        $$__referenceNumber: 'GLD-OLD-REF',
        answer: 'x'
      }
      // Not already on the destination, so the status change actually redirects.
      request.path = '/grant-a/confirmation'
    })

    describe('standard grant, document keyed by version (unchanged from main)', () => {
      beforeEach(() => {
        isStoredByReference.mockResolvedValue(false)
      })

      it('CLEARED resets the state to the bare status in place, dropping the reference so a fresh one is minted next load', async () => {
        mockGasStatus('APPLICATION_WITHDRAWN')

        await formsStatusRedirect(request, h, context)

        expect(mockCacheService.setState).toHaveBeenCalledWith(request, { applicationStatus: 'CLEARED' })
        expect(mockCacheService.clearApplicationState).not.toHaveBeenCalled()
        expect(updateApplicationStatus).not.toHaveBeenCalled()
        expect(h.redirect).toHaveBeenCalledWith('/grant-a/start')
      })

      it('REOPENED keeps the answers, records the old reference as previousReferenceNumber and drops $$__referenceNumber', async () => {
        mockGasStatus('APPLICATION_AMEND')

        await formsStatusRedirect(request, h, context)

        expect(mockCacheService.setState).toHaveBeenCalledWith(request, {
          answer: 'x',
          previousReferenceNumber: 'GLD-OLD-REF',
          applicationStatus: 'REOPENED'
        })
        expect(mockCacheService.clearApplicationState).not.toHaveBeenCalled()
        expect(generateUniqueReference).not.toHaveBeenCalled()
        expect(updateApplicationStatus).toHaveBeenCalledWith('REOPENED', '12345:grant-a', expect.anything())
        expect(h.redirect).toHaveBeenCalledWith('/grant-a/summary')
      })
    })

    it('CLEARED with a ref on the URL redirects even when already on the destination page, so the deleted ref leaves the address bar', async () => {
      isStoredByReference.mockResolvedValue(true)
      request.query = { ref: 'GLD-OLD-REF' }
      request.path = '/grant-a/start'
      mockGasStatus('APPLICATION_WITHDRAWN')

      await formsStatusRedirect(request, h, context)

      expect(h.redirect).toHaveBeenCalledWith('/grant-a/start')
    })

    describe.each([
      [
        'a grant flagged allowMultipleApplications',
        (req) => {
          req.app.model.def.metadata.allowMultipleApplications = true
        }
      ],
      [
        'a request scoped to an application by ?ref=',
        (req) => {
          req.query = { ref: 'GLD-OLD-REF' }
        }
      ]
    ])('application keyed by reference: %s', (_label, arrange) => {
      beforeEach(() => {
        arrange(request)
        getCacheKey.mockImplementation((req) => ({
          sbi: '12345',
          grantCode: 'grant-a',
          referenceNumber: req.app?.referenceNumber ?? req.query?.ref
        }))
      })

      it('CLEARED deletes the application document outright instead of saving it as cleared, and never saves without a reference', async () => {
        mockGasStatus('APPLICATION_WITHDRAWN')

        await formsStatusRedirect(request, h, context)

        expect(mockCacheService.clearApplicationState).toHaveBeenCalledWith(request, 'GLD-OLD-REF')
        expect(mockCacheService.setState).not.toHaveBeenCalled()
        expect(updateApplicationStatus).not.toHaveBeenCalled()
      })

      it('CLEARED forgets the old reference on the request, so the redirect does not carry it', async () => {
        mockGasStatus('APPLICATION_WITHDRAWN')

        await formsStatusRedirect(request, h, context)

        expect(request.query?.ref).toBeUndefined()
        expect(request.app.referenceNumber).toBeUndefined()
        expect(h.redirect).toHaveBeenCalledWith('/grant-a/start')
      })

      it('REOPENED saves the application under a newly minted reference (never without one), with the old one as previousReferenceNumber', async () => {
        mockGasStatus('APPLICATION_AMEND')

        await formsStatusRedirect(request, h, context)

        expect(generateUniqueReference).toHaveBeenCalledWith('GLD')
        expect(mockCacheService.setState).toHaveBeenCalledWith(request, {
          answer: 'x',
          $$__referenceNumber: 'GLD-NEW-REF',
          previousReferenceNumber: 'GLD-OLD-REF',
          applicationStatus: 'REOPENED'
        })
      })

      it('REOPENED never deletes the old document when saving the replacement fails (e.g. the backend was unreachable)', async () => {
        mockCacheService.setState.mockRejectedValueOnce(new Error('fetch failed'))
        mockGasStatus('APPLICATION_AMEND')

        await formsStatusRedirect(request, h, context)

        // The post-submission error handler turns the failure into the fallback redirect; what matters
        // is that nothing was deleted and the request was not moved onto a reference that was never saved.
        expect(mockCacheService.clearApplicationState).not.toHaveBeenCalled()
        expect(request.app.referenceNumber).not.toBe('GLD-NEW-REF')
      })

      it('REOPENED deletes the old document only after the new one is saved', async () => {
        const order = []
        mockCacheService.setState.mockImplementation(async () => order.push('save'))
        mockCacheService.clearApplicationState.mockImplementation(async () => order.push('delete'))
        mockGasStatus('APPLICATION_AMEND')

        await formsStatusRedirect(request, h, context)

        expect(mockCacheService.clearApplicationState).toHaveBeenCalledWith(request, 'GLD-OLD-REF')
        expect(order).toEqual(['save', 'delete'])
      })

      it('REOPENED redirects even when already on the destination page, so the address bar shows the new ref', async () => {
        request.path = '/grant-a/summary'
        mockGasStatus('APPLICATION_AMEND')

        await formsStatusRedirect(request, h, context)

        expect(h.redirect).toHaveBeenCalledWith('/grant-a/summary?ref=GLD-NEW-REF')
      })

      it('REOPENED re-scopes the request to the new reference, so the status update and the redirect use it', async () => {
        mockGasStatus('APPLICATION_AMEND')

        await formsStatusRedirect(request, h, context)

        expect(request.app.referenceNumber).toBe('GLD-NEW-REF')
        expect(updateApplicationStatus).toHaveBeenCalledWith('REOPENED', '12345:grant-a:GLD-NEW-REF', expect.anything())
        expect(h.redirect).toHaveBeenCalledWith('/grant-a/summary?ref=GLD-NEW-REF')
      })
    })
  })
})
