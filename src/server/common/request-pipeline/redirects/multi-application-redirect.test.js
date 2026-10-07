import { describe, expect, it, vi, beforeEach } from 'vitest'
import { multiApplicationRedirect } from './multi-application-redirect.js'
import { getStateWithDefinition } from '../../helpers/state/state-with-definition-context.js'
import { listApplicationsFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { getGrantCode } from '../../helpers/grant-code.js'

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

const ROOT = '/{slug}'
const SUB_PAGE = '/{slug}/{path}/{itemId?}'

const multiGrant = (state = { state: { foo: 'bar' } }) => ({ definition: { allowMultipleApplications: true }, state })
const singleGrant = (state = { state: { foo: 'bar' } }) => ({ definition: { allowMultipleApplications: false }, state })

describe('multiApplicationRedirect', () => {
  const takeover = Symbol('takeover')
  const h = {
    continue: Symbol('continue'),
    redirect: vi.fn(() => ({ takeover: () => takeover }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getGrantCode.mockReturnValue('test-grant')
  })

  const makeRequest = ({ query = {}, routePath = ROOT, path = '/test-grant', method = 'get', app = {} } = {}) => ({
    params: { slug: 'test-grant' },
    query,
    path,
    url: new URL(`${path}?${new URLSearchParams(query)}`, 'http://localhost:3000'),
    method,
    app,
    route: { path: routePath }
  })

  describe('multi-application grant, with a ref', () => {
    it('continues when the backend resolves state for that ref, without listing applications', async () => {
      getStateWithDefinition.mockResolvedValue(multiGrant())
      const request = makeRequest({ query: { ref: 'REF-1' } })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('throws 404 when the backend finds no state for that ref (unrecognised or belongs to another business)', async () => {
      getStateWithDefinition.mockResolvedValue(multiGrant(null))
      const request = makeRequest({ query: { ref: 'REF-BOGUS' } })

      await expect(multiApplicationRedirect(request, h)).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 404 }
      })
    })

    it('reads the ref from request.app too (a POST scoped in place earlier in the same request)', async () => {
      getStateWithDefinition.mockResolvedValue(multiGrant())
      const request = makeRequest({ app: { applicationRef: 'REF-1' } })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })

    it('leaves the ref on the URL of a sub-page so it stays attached to this request, not the session', async () => {
      getStateWithDefinition.mockResolvedValue(multiGrant())
      const request = makeRequest({ query: { ref: 'REF-1' }, routePath: SUB_PAGE, path: '/test-grant/summary' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(request.query).toEqual({ ref: 'REF-1' })
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('never redirects a POST that carries a ref, so its payload is processed', async () => {
      getStateWithDefinition.mockResolvedValue(multiGrant())
      const request = makeRequest({ query: { ref: 'REF-1' }, routePath: SUB_PAGE, method: 'post' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('recognises the flag on the authored definition metadata as well', async () => {
      getStateWithDefinition.mockResolvedValue({
        definition: { definition: { metadata: { allowMultipleApplications: true } } },
        state: null
      })
      const request = makeRequest({ query: { ref: 'REF-BOGUS' } })

      await expect(multiApplicationRedirect(request, h)).rejects.toMatchObject({ output: { statusCode: 404 } })
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })
  })

  describe('single-application grant, with a ref (ignored, as before multi-application support)', () => {
    beforeEach(() => {
      getStateWithDefinition.mockResolvedValue(singleGrant(null))
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])
    })

    it('redirects a GET to the same URL without the ref, keeping every other query parameter', async () => {
      const request = makeRequest({
        query: { ref: 'REF-1', parcelId: 'SD1', returnUrl: '/test-grant/summary' },
        routePath: SUB_PAGE,
        path: '/test-grant/remove-parcel'
      })

      const result = await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith(
        '/test-grant/remove-parcel?parcelId=SD1&returnUrl=%2Ftest-grant%2Fsummary'
      )
      expect(result).toBe(takeover)
    })

    it('redirects to the bare path when the ref was the only parameter', async () => {
      const request = makeRequest({ query: { ref: 'REF-1' }, routePath: SUB_PAGE, path: '/test-grant/page' })

      await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/page')
    })

    it('strips the ref from the request before redirecting, so nothing downstream (e.g. the redirect rewriting) puts it back', async () => {
      const request = makeRequest({
        query: { ref: 'REF-1', a: '1' },
        routePath: SUB_PAGE,
        app: { applicationRef: 'REF-1', stateWithDefinition: Promise.resolve(null) }
      })

      await multiApplicationRedirect(request, h)

      expect(request.query).toEqual({ a: '1' })
      expect(request.app.applicationRef).toBeUndefined()
      expect(request.app.stateWithDefinition).toBeUndefined()
    })

    it('lets a POST carry on in place without the ref, so its payload is not lost', async () => {
      const request = makeRequest({ query: { ref: 'REF-1' }, routePath: SUB_PAGE, method: 'post' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
      expect(request.query).toEqual({})
    })

    it('does not 404 on a ref that resolves no state - a single-application grant never had one to resolve', async () => {
      listApplicationsFromApi.mockResolvedValue([])
      const request = makeRequest({ query: { ref: 'REF-BOGUS' } })

      await expect(multiApplicationRedirect(request, h)).resolves.toBe(takeover)
    })

    it("keeps a ref that resolves to one of the SBI's applications even when the definition is not flagged (the backend keys those by ref regardless)", async () => {
      getStateWithDefinition.mockResolvedValue(
        singleGrant({ applicationRef: 'REF-1', allowMultipleApplications: true, state: { foo: 'bar' } })
      )
      const request = makeRequest({ query: { ref: 'REF-1' }, routePath: SUB_PAGE })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(request.query).toEqual({ ref: 'REF-1' })
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })

    it('404s an unknown ref on such a grant too', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }, { applicationRef: 'REF-2' }])
      const request = makeRequest({ query: { ref: 'REF-BOGUS' } })

      await expect(multiApplicationRedirect(request, h)).rejects.toMatchObject({ output: { statusCode: 404 } })
    })
  })

  describe('multi-application grant, no ref', () => {
    beforeEach(() => {
      getStateWithDefinition.mockResolvedValue(multiGrant())
    })

    it('continues when the sbi has no applications yet (start new)', async () => {
      listApplicationsFromApi.mockResolvedValue([])
      const request = makeRequest()

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('continues with no ref when the sbi has exactly one application - it stays ref-less for the whole journey, as on a single-application grant', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/summary' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
      expect(request.app.applicationRef).toBeUndefined()
    })

    describe('one live application shadowed by a purged one (the list hides purged applications, the unscoped read does not)', () => {
      const purgedPick = () => multiGrant({ applicationRef: 'REF-PURGED', state: { applicationStatus: 'PURGED' } })

      it('attaches the live application ref to a GET so the next read is scoped to it', async () => {
        getStateWithDefinition.mockResolvedValue(purgedPick())
        listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-LIVE' }])
        const request = makeRequest({
          query: { parcelId: 'SD1' },
          routePath: SUB_PAGE,
          path: '/test-grant/summary',
          app: { stateWithDefinition: Promise.resolve(purgedPick()) }
        })

        const result = await multiApplicationRedirect(request, h)

        expect(h.redirect).toHaveBeenCalledWith('/test-grant/summary?parcelId=SD1&ref=REF-LIVE')
        expect(result).toBe(takeover)
        expect(request.app.stateWithDefinition).toBeUndefined()
      })

      it('scopes a POST in place instead, keeping its payload', async () => {
        getStateWithDefinition.mockResolvedValue(purgedPick())
        listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-LIVE' }])
        const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/page', method: 'post' })

        const result = await multiApplicationRedirect(request, h)

        expect(result).toBe(h.continue)
        expect(h.redirect).not.toHaveBeenCalled()
        expect(request.app.applicationRef).toBe('REF-LIVE')
      })

      it('does not attach a ref when the purged document IS the listed one (nothing is shadowed)', async () => {
        getStateWithDefinition.mockResolvedValue(purgedPick())
        listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-PURGED' }])
        const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/page' })

        const result = await multiApplicationRedirect(request, h)

        expect(result).toBe(h.continue)
        expect(h.redirect).not.toHaveBeenCalled()
      })

      it('does not attach a ref when the unscoped read already picked the live application', async () => {
        getStateWithDefinition.mockResolvedValue(multiGrant({ applicationRef: 'REF-LIVE', state: { foo: 'bar' } }))
        listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-LIVE' }])
        const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/page' })

        const result = await multiApplicationRedirect(request, h)

        expect(result).toBe(h.continue)
        expect(h.redirect).not.toHaveBeenCalled()
      })
    })

    it('leaves a request for the selector itself alone, so it cannot redirect to itself forever', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }, { applicationRef: 'REF-2' }])
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/applications' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
      expect(getStateWithDefinition).not.toHaveBeenCalled()
    })

    it('redirects the root to the applications selector when the sbi has more than one application', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }, { applicationRef: 'REF-2' }])
      const request = makeRequest()

      const result = await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/applications')
      expect(result).toBe(takeover)
    })

    it('sends a deep link (or a URL whose ref was removed) to the selector when there are several applications - never an arbitrary one', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }, { applicationRef: 'REF-2' }])
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/summary' })

      const result = await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/applications')
      expect(result).toBe(takeover)
    })

    it('does the same on a POST whose ref was removed', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }, { applicationRef: 'REF-2' }])
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/page', method: 'post' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(takeover)
    })

    it('recognises ref-keyed documents even when the definition is not flagged (the backend marks them allowMultipleApplications)', async () => {
      getStateWithDefinition.mockResolvedValue(
        singleGrant({ applicationRef: 'REF-2', allowMultipleApplications: true, state: { foo: 'bar' } })
      )
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }, { applicationRef: 'REF-2' }])
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/summary' })

      await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/applications')
    })
  })

  describe('single-application grant, no ref (unchanged behaviour)', () => {
    beforeEach(() => {
      getStateWithDefinition.mockResolvedValue(singleGrant())
    })

    it('continues on a sub-page without listing applications', async () => {
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/summary' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })

    it('does not list applications for a version-keyed document just because it carries an applicationRef (every document does)', async () => {
      getStateWithDefinition.mockResolvedValue(
        singleGrant({ applicationRef: 'REF-1', allowMultipleApplications: false, state: { foo: 'bar' } })
      )
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/summary' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })

    it('continues on the root when the sbi has no applications yet', async () => {
      listApplicationsFromApi.mockResolvedValue([])

      const result = await multiApplicationRedirect(makeRequest(), h)

      expect(result).toBe(h.continue)
    })

    it('continues on the root with exactly one application - the backend resolves it unaided, as it always has', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])

      const result = await multiApplicationRedirect(makeRequest(), h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('still sends the root to the selector when the sbi somehow holds several', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }, { applicationRef: 'REF-2' }])

      const result = await multiApplicationRedirect(makeRequest(), h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/applications')
      expect(result).toBe(takeover)
    })

    it('continues when the envelope itself is missing', async () => {
      getStateWithDefinition.mockResolvedValue(null)

      const result = await multiApplicationRedirect(makeRequest({ routePath: SUB_PAGE }), h)

      expect(result).toBe(h.continue)
    })
  })
})
