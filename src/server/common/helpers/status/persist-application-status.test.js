import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateApplicationStatus } from './update-application-status-helper.js'
import { ApplicationStatus } from '../../constants/application-status.js'
import { persistStatus } from './persist-application-status.js'
import { setupRedirectTest } from '../../request-pipeline/redirects/forms-status-redirect.test-helpers.js'
import { getCacheKey } from '../state/get-cache-key-helper.js'
import { generateUniqueReference } from '@defra/forms-engine-plugin/engine/referenceNumbers.js'
import { isStoredByReference } from '../state/state-with-definition-context.js'

vi.mock('../../helpers/logging/log.js', async () => {
  const { mockLogHelper } = await import('~/src/__mocks__')
  return mockLogHelper()
})
vi.mock('../../services/grant-application/grant-application.service.js', () => ({
  getApplicationStatus: vi.fn()
}))
vi.mock('../../helpers/status/update-application-status-helper.js', () => ({
  updateApplicationStatus: vi.fn()
}))
vi.mock('../../helpers/forms-cache/forms-cache.js', () => ({
  getFormsCacheService: vi.fn()
}))
vi.mock('../../helpers/lock/lock-token.js', () => ({
  mintLockToken: vi.fn().mockReturnValue('mock-lock-token')
}))
vi.mock('../../helpers/state/get-cache-key-helper.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCacheKey: vi.fn().mockReturnValue({ sbi: '12345', grantCode: 'grant-a' })
}))
vi.mock('@defra/forms-engine-plugin/engine/referenceNumbers.js', () => ({
  generateUniqueReference: vi.fn((prefix) => `${prefix}-NEW-REF`)
}))
vi.mock('../state/state-with-definition-context.js', () => ({
  isStoredByReference: vi.fn()
}))

const SUBMITTED = ApplicationStatus.SUBMITTED
const CLEARED = ApplicationStatus.CLEARED
const REOPENED = ApplicationStatus.REOPENED

describe('persistStatus', () => {
  let request
  let mockCacheService
  const existingState = () => ({ applicationStatus: SUBMITTED, $$__referenceNumber: 'GLD-OLD-REF', answer: 'x' })

  beforeEach(() => {
    ;({ request, mockCacheService } = setupRedirectTest())
    mockCacheService.clearApplicationState = vi.fn()
    request.app.model.def.metadata.referenceNumberPrefix = 'GLD'
  })

  it('persists nothing when the status has not changed', async () => {
    await persistStatus(request, SUBMITTED, SUBMITTED, existingState())

    expect(mockCacheService.setState).not.toHaveBeenCalled()
    expect(updateApplicationStatus).not.toHaveBeenCalled()
  })

  it('patches any other status with a lock token for the current version', async () => {
    await persistStatus(request, SUBMITTED, REOPENED, existingState())

    expect(mockCacheService.setState).not.toHaveBeenCalled()
    expect(updateApplicationStatus).toHaveBeenCalledWith(SUBMITTED, '12345:grant-a', {
      lockToken: 'mock-lock-token',
      grantVersion: '1.0.0'
    })
  })

  describe('standard grant, document keyed by version (unchanged from main)', () => {
    beforeEach(() => {
      isStoredByReference.mockResolvedValue(false)
    })

    it('CLEARED resets the state to the bare status in place, dropping the reference so a fresh one is minted next load', async () => {
      await persistStatus(request, CLEARED, SUBMITTED, existingState())

      expect(mockCacheService.setState).toHaveBeenCalledWith(request, { applicationStatus: CLEARED })
      expect(mockCacheService.clearApplicationState).not.toHaveBeenCalled()
      expect(updateApplicationStatus).not.toHaveBeenCalled()
    })

    it('REOPENED keeps the answers, records the old reference as previousReferenceNumber and drops $$__referenceNumber', async () => {
      await persistStatus(request, REOPENED, SUBMITTED, existingState())

      expect(mockCacheService.setState).toHaveBeenCalledWith(request, {
        answer: 'x',
        previousReferenceNumber: 'GLD-OLD-REF',
        applicationStatus: REOPENED
      })
      expect(mockCacheService.clearApplicationState).not.toHaveBeenCalled()
      expect(generateUniqueReference).not.toHaveBeenCalled()
      expect(updateApplicationStatus).toHaveBeenCalledWith(REOPENED, '12345:grant-a', expect.anything())
    })
  })

  describe('application keyed by reference', () => {
    beforeEach(() => {
      isStoredByReference.mockResolvedValue(true)
      request.query = { ref: 'GLD-OLD-REF' }
      getCacheKey.mockImplementation((req) => ({
        sbi: '12345',
        grantCode: 'grant-a',
        referenceNumber: req.app?.referenceNumber ?? req.query?.ref
      }))
      // Saves only log their failures, so the reopen reads the new document back before deleting the old one.
      mockCacheService.getState = vi.fn().mockResolvedValue(existingState())
      mockCacheService.setState.mockImplementation(async (_req, state) => {
        mockCacheService.getState.mockResolvedValue(state)
        return state
      })
    })

    it('CLEARED deletes the application document outright instead of saving it as cleared, and never saves without a reference', async () => {
      await persistStatus(request, CLEARED, SUBMITTED, existingState())

      expect(mockCacheService.clearApplicationState).toHaveBeenCalledWith(request, 'GLD-OLD-REF')
      expect(mockCacheService.setState).not.toHaveBeenCalled()
      expect(updateApplicationStatus).not.toHaveBeenCalled()
    })

    it('CLEARED forgets the old reference on the request, so the redirect that follows does not carry it', async () => {
      await persistStatus(request, CLEARED, SUBMITTED, existingState())

      expect(request.query?.ref).toBeUndefined()
      expect(request.app.referenceNumber).toBeUndefined()
    })

    it("CLEARED falls back to the request's reference when the stored state no longer carries one", async () => {
      await persistStatus(request, CLEARED, SUBMITTED, { applicationStatus: SUBMITTED })

      expect(mockCacheService.clearApplicationState).toHaveBeenCalledWith(request, 'GLD-OLD-REF')
    })

    it('REOPENED saves the application under a newly minted reference (never without one), with the old one as previousReferenceNumber', async () => {
      await persistStatus(request, REOPENED, SUBMITTED, existingState())

      expect(generateUniqueReference).toHaveBeenCalledWith('GLD')
      expect(mockCacheService.setState).toHaveBeenCalledWith(request, {
        answer: 'x',
        $$__referenceNumber: 'GLD-NEW-REF',
        previousReferenceNumber: 'GLD-OLD-REF',
        applicationStatus: REOPENED
      })
    })

    it('REOPENED re-scopes the request to the new reference, so the status update uses it', async () => {
      await persistStatus(request, REOPENED, SUBMITTED, existingState())

      expect(request.app.referenceNumber).toBe('GLD-NEW-REF')
      expect(updateApplicationStatus).toHaveBeenCalledWith(REOPENED, '12345:grant-a:GLD-NEW-REF', expect.anything())
    })

    it('REOPENED deletes the old document only after the new one is saved', async () => {
      const order = []
      mockCacheService.setState.mockImplementation(async (_req, state) => {
        order.push('save')
        mockCacheService.getState.mockResolvedValue(state)
      })
      mockCacheService.clearApplicationState.mockImplementation(async () => order.push('delete'))

      await persistStatus(request, REOPENED, SUBMITTED, existingState())

      expect(mockCacheService.clearApplicationState).toHaveBeenCalledWith(request, 'GLD-OLD-REF')
      expect(order).toEqual(['save', 'delete'])
    })

    it('REOPENED never deletes the old document when the replacement does not read back (the save failed quietly)', async () => {
      mockCacheService.setState.mockImplementation(async () => undefined)

      await expect(persistStatus(request, REOPENED, SUBMITTED, existingState())).rejects.toMatchObject({
        name: 'ExternalApiError'
      })

      expect(mockCacheService.clearApplicationState).not.toHaveBeenCalled()
      expect(updateApplicationStatus).not.toHaveBeenCalled()
      expect(request.app.referenceNumber).toBe('GLD-OLD-REF')
    })

    it('REOPENED undoes the reopen when the old document cannot be deleted, so the business keeps its one submitted application', async () => {
      mockCacheService.clearApplicationState.mockImplementation(async (_req, ref) => {
        if (ref === 'GLD-OLD-REF') {
          throw new Error('backend down')
        }
      })

      await expect(persistStatus(request, REOPENED, SUBMITTED, existingState())).rejects.toThrow('backend down')

      expect(mockCacheService.clearApplicationState).toHaveBeenCalledWith(request, 'GLD-NEW-REF')
      expect(updateApplicationStatus).not.toHaveBeenCalled()
      expect(request.app.referenceNumber).toBe('GLD-OLD-REF')
    })
  })
})
