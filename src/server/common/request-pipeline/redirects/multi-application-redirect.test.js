import { describe, expect, it, vi, beforeEach } from 'vitest'
import { multiApplicationRedirect } from './multi-application-redirect.js'
import { getStateWithDefinition } from '../../helpers/state/state-with-definition-context.js'
import { listApplicationsFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { getAuthenticatedSbi } from '../../helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../../helpers/grant-code.js'
import {
  getCacheKey,
  persistApplication,
  clearPersistedApplication
} from '../../helpers/state/get-cache-key-helper.js'

vi.mock('../../helpers/state/state-with-definition-context.js', () => ({
  getStateWithDefinition: vi.fn()
}))

vi.mock('../../helpers/state/fetch-saved-state-helper.js', () => ({
  listApplicationsFromApi: vi.fn()
}))

vi.mock('../../helpers/auth/get-auth-identifiers.js', () => ({
  getAuthenticatedSbi: vi.fn(() => 'sbi-1')
}))

vi.mock('../../helpers/grant-code.js', () => ({
  getGrantCode: vi.fn(() => 'test-grant')
}))

vi.mock('../../helpers/state/get-cache-key-helper.js', () => ({
  getCacheKey: vi.fn(),
  persistApplication: vi.fn(),
  clearPersistedApplication: vi.fn()
}))

describe('multiApplicationRedirect', () => {
  const h = {
    continue: Symbol('continue'),
    redirect: vi.fn()
  }

  const MULTI_APP_ENVELOPE = { definition: { allowMultipleApplications: true }, state: null }

  beforeEach(() => {
    vi.clearAllMocks()
    getCacheKey.mockReturnValue({ sbi: 'sbi-1', grantCode: 'test-grant' })
    getGrantCode.mockReturnValue('test-grant')
    getStateWithDefinition.mockResolvedValue(MULTI_APP_ENVELOPE)
  })

  const makeRequest = (query = {}, routePath = '/{slug}') => ({
    params: { slug: 'test-grant' },
    query,
    route: { path: routePath }
  })

  describe('single-application schemes (no allowMultipleApplications)', () => {
    it('continues immediately without touching applications/session at all', async () => {
      getStateWithDefinition.mockResolvedValue({ definition: {}, state: null })
      const request = makeRequest({ ref: 'anything' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
      expect(getCacheKey).not.toHaveBeenCalled()
      expect(persistApplication).not.toHaveBeenCalled()
      expect(clearPersistedApplication).not.toHaveBeenCalled()
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('continues when the envelope itself is missing (treated as not multi-application)', async () => {
      getStateWithDefinition.mockResolvedValue(null)
      const request = makeRequest()

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })

    it('also respects allowMultipleApplications mirrored on state instead of definition', async () => {
      getStateWithDefinition.mockResolvedValue({ definition: {}, state: { allowMultipleApplications: false } })
      const request = makeRequest()

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })
  })

  describe('with a ref in the query string', () => {
    it('continues and persists the ref when the backend resolves state for that ref', async () => {
      getStateWithDefinition.mockResolvedValue({
        definition: { allowMultipleApplications: true },
        state: { state: { foo: 'bar' } }
      })
      const request = makeRequest({ ref: 'REF-1' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(persistApplication).toHaveBeenCalledWith(request, 'test-grant', 'REF-1')
      expect(getAuthenticatedSbi).not.toHaveBeenCalled()
    })

    it('throws 404 when the backend finds no state for that ref (unrecognised or belongs to another business)', async () => {
      getStateWithDefinition.mockResolvedValue({ definition: { allowMultipleApplications: true }, state: null })
      const request = makeRequest({ ref: 'REF-BOGUS' })

      await expect(multiApplicationRedirect(request, h)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
      expect(persistApplication).not.toHaveBeenCalled()
    })

    it('ignores any session-persisted ref (the URL ref always wins, getCacheKey is never consulted)', async () => {
      getStateWithDefinition.mockResolvedValue({
        definition: { allowMultipleApplications: true },
        state: { state: { foo: 'bar' } }
      })
      const request = makeRequest({ ref: 'REF-1' })

      await multiApplicationRedirect(request, h)

      expect(getCacheKey).not.toHaveBeenCalled()
    })
  })

  describe('no ref, on a sub-page, with a ref already persisted to session', () => {
    it('trusts the persisted ref and continues without re-counting applications', async () => {
      getCacheKey.mockReturnValue({ sbi: 'sbi-1', grantCode: 'test-grant', referenceNumber: 'REF-1' })
      const request = makeRequest({}, '/{slug}/{path}/{itemId?}')

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('does not touch the persisted ref', async () => {
      getCacheKey.mockReturnValue({ sbi: 'sbi-1', grantCode: 'test-grant', referenceNumber: 'REF-1' })
      const request = makeRequest({}, '/{slug}/{path}/{itemId?}')

      await multiApplicationRedirect(request, h)

      expect(persistApplication).not.toHaveBeenCalled()
      expect(clearPersistedApplication).not.toHaveBeenCalled()
    })
  })

  describe('no ref, on a sub-page, with nothing persisted', () => {
    it('falls through to the application-count logic, same as the root route', async () => {
      getCacheKey.mockReturnValue({ sbi: 'sbi-1', grantCode: 'test-grant' })
      listApplicationsFromApi.mockResolvedValue([{ referenceNumber: 'REF-1' }])
      const request = makeRequest({}, '/{slug}/{path}/{itemId?}')

      const result = await multiApplicationRedirect(request, h)

      expect(listApplicationsFromApi).toHaveBeenCalled()
      expect(result).toBe(h.continue)
    })
  })

  describe('no ref, on the /{slug} root', () => {
    it('always re-evaluates via listApplicationsFromApi, even when a ref is persisted', async () => {
      getCacheKey.mockReturnValue({ sbi: 'sbi-1', grantCode: 'test-grant', referenceNumber: 'REF-1' })
      listApplicationsFromApi.mockResolvedValue([{ referenceNumber: 'REF-1' }])
      const request = makeRequest({}, '/{slug}')

      await multiApplicationRedirect(request, h)

      expect(listApplicationsFromApi).toHaveBeenCalled()
    })

    it('continues and clears any persisted ref when the sbi has no applications yet (start new)', async () => {
      listApplicationsFromApi.mockResolvedValue([])
      const request = makeRequest()

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
      expect(clearPersistedApplication).toHaveBeenCalledWith(request)
    })

    it('pins the single application as the active ref and continues', async () => {
      listApplicationsFromApi.mockResolvedValue([{ referenceNumber: 'REF-1' }])
      const request = makeRequest()

      const result = await multiApplicationRedirect(request, h)

      expect(persistApplication).toHaveBeenCalledWith(request, 'test-grant', 'REF-1')
      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('does not clear the persisted ref when there is exactly one application', async () => {
      listApplicationsFromApi.mockResolvedValue([{ referenceNumber: 'REF-1' }])
      const request = makeRequest()

      await multiApplicationRedirect(request, h)

      expect(clearPersistedApplication).not.toHaveBeenCalled()
    })

    it('redirects to the applications stub when the sbi has more than one application', async () => {
      const takeover = Symbol('takeover')
      h.redirect.mockReturnValue({ takeover: () => takeover })
      listApplicationsFromApi.mockResolvedValue([{ referenceNumber: 'REF-1' }, { referenceNumber: 'REF-2' }])
      const request = makeRequest()

      const result = await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/applications')
      expect(result).toBe(takeover)
    })

    it('does not touch the persisted ref when redirecting to the applications stub (the stub clears it itself)', async () => {
      h.redirect.mockReturnValue({ takeover: () => Symbol('takeover') })
      listApplicationsFromApi.mockResolvedValue([{ referenceNumber: 'REF-1' }, { referenceNumber: 'REF-2' }])
      const request = makeRequest()

      await multiApplicationRedirect(request, h)

      expect(persistApplication).not.toHaveBeenCalled()
      expect(clearPersistedApplication).not.toHaveBeenCalled()
    })
  })
})
