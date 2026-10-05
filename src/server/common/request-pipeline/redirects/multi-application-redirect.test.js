import { describe, expect, it, vi, beforeEach } from 'vitest'
import { multiApplicationRedirect } from './multi-application-redirect.js'
import { getStateWithDefinition } from '../../helpers/state/state-with-definition-context.js'
import { listApplicationsFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { getAuthenticatedSbi } from '../../helpers/auth/get-auth-identifiers.js'
import { getGrantCode } from '../../helpers/grant-code.js'
import {
  getCacheKey,
  setApplicationInSession,
  clearApplicationFromSession
} from '../../helpers/state/get-cache-key-helper.js'

vi.mock('../../helpers/state/state-with-definition-context.js', () => ({
  getStateWithDefinition: vi.fn()
}))

vi.mock('../../helpers/state/fetch-saved-state-helper.js', () => ({
  listApplicationsFromApi: vi.fn()
}))

vi.mock('../../helpers/auth/get-auth-identifiers.js', () => ({
  getAuthenticatedCrn: vi.fn(() => 'crn-1'),
  getAuthenticatedSbi: vi.fn(() => 'sbi-1')
}))

vi.mock('../../helpers/grant-code.js', () => ({
  getGrantCode: vi.fn(() => 'test-grant')
}))

vi.mock('../../helpers/state/get-cache-key-helper.js', () => ({
  getCacheKey: vi.fn(),
  setApplicationInSession: vi.fn(),
  clearApplicationFromSession: vi.fn()
}))

describe('multiApplicationRedirect', () => {
  const h = {
    continue: Symbol('continue'),
    redirect: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getCacheKey.mockReturnValue({ sbi: 'sbi-1', grantCode: 'test-grant' })
    getGrantCode.mockReturnValue('test-grant')
  })

  const makeRequest = (query = {}, routePath = '/{slug}', path = '/test-grant') => ({
    params: { slug: 'test-grant' },
    query,
    path,
    route: { path: routePath }
  })

  describe('with a ref in the query string', () => {
    it('continues and persists the ref when the backend resolves state for that ref', async () => {
      getStateWithDefinition.mockResolvedValue({ state: { state: { foo: 'bar' } } })
      const request = makeRequest({ ref: 'REF-1' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(setApplicationInSession).toHaveBeenCalledWith(request, 'REF-1')
      expect(getAuthenticatedSbi).not.toHaveBeenCalled()
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })

    it('throws 404 when the backend finds no state for that ref (unrecognised or belongs to another business)', async () => {
      getStateWithDefinition.mockResolvedValue({ state: null })
      const request = makeRequest({ ref: 'REF-BOGUS' })

      await expect(multiApplicationRedirect(request, h)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
      expect(setApplicationInSession).not.toHaveBeenCalled()
    })

    it('throws 404 when the envelope itself is missing', async () => {
      getStateWithDefinition.mockResolvedValue(null)
      const request = makeRequest({ ref: 'REF-BOGUS' })

      await expect(multiApplicationRedirect(request, h)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('ignores any session-persisted ref (the URL ref always wins, getCacheKey is never consulted)', async () => {
      getStateWithDefinition.mockResolvedValue({ state: { state: { foo: 'bar' } } })
      const request = makeRequest({ ref: 'REF-1' })

      await multiApplicationRedirect(request, h)

      expect(getCacheKey).not.toHaveBeenCalled()
    })

    it('continues on the root route, leaving the redirect to the entry page to the forms-engine-plugin itself', async () => {
      getStateWithDefinition.mockResolvedValue({ state: { state: { foo: 'bar' } } })
      const request = makeRequest({ ref: 'REF-1' }, '/{slug}')

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('redirects to the same sub-page with the query string stripped, now that the ref is in session', async () => {
      const takeover = Symbol('takeover')
      h.redirect.mockReturnValue({ takeover: () => takeover })
      getStateWithDefinition.mockResolvedValue({ state: { state: { foo: 'bar' } } })
      const request = makeRequest({ ref: 'REF-1' }, '/{slug}/{path}/{itemId?}', '/test-grant/summary')

      const result = await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/summary')
      expect(result).toBe(takeover)
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

      expect(setApplicationInSession).not.toHaveBeenCalled()
      expect(clearApplicationFromSession).not.toHaveBeenCalled()
    })
  })

  describe('no ref, on a sub-page, with nothing persisted', () => {
    it('continues without checking application count - only the root route resolves that', async () => {
      getCacheKey.mockReturnValue({ sbi: 'sbi-1', grantCode: 'test-grant' })
      const request = makeRequest({}, '/{slug}/{path}/{itemId?}')

      const result = await multiApplicationRedirect(request, h)

      expect(listApplicationsFromApi).not.toHaveBeenCalled()
      expect(setApplicationInSession).not.toHaveBeenCalled()
      expect(clearApplicationFromSession).not.toHaveBeenCalled()
      expect(result).toBe(h.continue)
    })
  })

  describe('no ref, on the /{slug} root', () => {
    it('always re-evaluates via listApplicationsFromApi, even when a ref is persisted', async () => {
      getCacheKey.mockReturnValue({ sbi: 'sbi-1', grantCode: 'test-grant', referenceNumber: 'REF-1' })
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])
      const request = makeRequest({}, '/{slug}')

      await multiApplicationRedirect(request, h)

      expect(listApplicationsFromApi).toHaveBeenCalled()
    })

    it('never consults getStateWithDefinition or the allowMultipleApplications flag - branches purely on count', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])
      const request = makeRequest()

      await multiApplicationRedirect(request, h)

      expect(getStateWithDefinition).not.toHaveBeenCalled()
    })

    it('continues and clears any persisted ref when the sbi has no applications yet (start new)', async () => {
      listApplicationsFromApi.mockResolvedValue([])
      const request = makeRequest()

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
      expect(clearApplicationFromSession).toHaveBeenCalledWith(request)
    })

    it('pins the single application as the active ref and continues', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])
      const request = makeRequest()

      const result = await multiApplicationRedirect(request, h)

      expect(setApplicationInSession).toHaveBeenCalledWith(request, 'REF-1')
      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('does not clear the persisted ref when there is exactly one application', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])
      const request = makeRequest()

      await multiApplicationRedirect(request, h)

      expect(clearApplicationFromSession).not.toHaveBeenCalled()
    })

    it('redirects to the applications stub when the sbi has more than one application', async () => {
      const takeover = Symbol('takeover')
      h.redirect.mockReturnValue({ takeover: () => takeover })
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }, { referenceNumber: 'REF-2' }])
      const request = makeRequest()

      const result = await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/applications')
      expect(result).toBe(takeover)
    })

    it('clears any stale persisted ref when redirecting to the applications stub (which application is active is no longer known)', async () => {
      h.redirect.mockReturnValue({ takeover: () => Symbol('takeover') })
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }, { referenceNumber: 'REF-2' }])
      const request = makeRequest()

      await multiApplicationRedirect(request, h)

      expect(setApplicationInSession).not.toHaveBeenCalled()
      expect(clearApplicationFromSession).toHaveBeenCalledWith(request)
    })
  })
})
