import { getRoutingDefinition } from '../../helpers/definition/routing-definition.js'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { multiApplicationRedirect } from './multi-application-redirect.js'
import { getStateWithDefinition } from '../../helpers/state/state-with-definition-context.js'
import { listApplicationsFromApi } from '../../helpers/state/fetch-saved-state-helper.js'
import { getGrantCode } from '../../helpers/grant-code.js'

vi.mock('../../helpers/state/state-with-definition-context.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getStateWithDefinition: vi.fn()
}))

vi.mock('../../helpers/definition/routing-definition.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getRoutingDefinition: vi.fn()
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
    getRoutingDefinition.mockImplementation(() => getStateWithDefinition())
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

  describe('backend unavailable', () => {
    it('continues without deciding anything, so the failure surfaces later with full context (as on main)', async () => {
      getStateWithDefinition.mockRejectedValue(new Error('backend down'))
      const request = makeRequest({ query: { ref: 'REF-1' } })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
      expect(h.redirect).not.toHaveBeenCalled()
    })
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
      const request = makeRequest({ app: { referenceNumber: 'REF-1' } })

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

  describe('malformed ref', () => {
    it('404s on a multi-application grant, without listing applications', async () => {
      getStateWithDefinition.mockResolvedValue(multiGrant())
      const request = makeRequest({ query: { ref: 'INVALID:REF' }, routePath: SUB_PAGE, path: '/test-grant/tasks' })

      await expect(multiApplicationRedirect(request, h)).rejects.toMatchObject({ output: { statusCode: 404 } })
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })

    it('is ignored on a single-application grant like any other stray parameter', async () => {
      getStateWithDefinition.mockResolvedValue(singleGrant())
      const request = makeRequest({
        query: { ref: 'INVALID:REF', foo: '1' },
        routePath: SUB_PAGE,
        path: '/test-grant/tasks'
      })

      const result = await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/tasks?foo=1')
      expect(result).toBe(takeover)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })
  })

  describe('single-application grant, with a ref (ignored, as before multi-application support)', () => {
    beforeEach(() => {
      getStateWithDefinition.mockResolvedValue(singleGrant(null))
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])
    })

    it("ignores a ref even when it matches the grant's single, version-keyed document (every document carries an applicationRef)", async () => {
      getStateWithDefinition.mockResolvedValue(
        singleGrant({ applicationRef: 'REF-1', allowMultipleApplications: false, state: { foo: 'bar' } })
      )
      const request = makeRequest({ query: { ref: 'REF-1' }, routePath: SUB_PAGE, path: '/test-grant/tasks' })

      const result = await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/tasks')
      expect(result).toBe(takeover)
      expect(request.query).toEqual({})
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
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
        app: { referenceNumber: 'REF-1', stateWithDefinition: Promise.resolve(null) }
      })

      await multiApplicationRedirect(request, h)

      expect(request.query).toEqual({ a: '1' })
      expect(request.app.referenceNumber).toBeUndefined()
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

    it('starts afresh when no live application remains, forgetting the purged document the unscoped read found', async () => {
      const purged = multiGrant({
        applicationRef: 'REF-PURGED',
        allowMultipleApplications: true,
        state: { applicationStatus: 'PURGED', answer: 'x' }
      })
      getStateWithDefinition.mockResolvedValue(purged)
      listApplicationsFromApi.mockResolvedValue([])
      const request = makeRequest({
        routePath: SUB_PAGE,
        path: '/test-grant/tasks',
        app: { stateWithDefinition: Promise.resolve(purged) }
      })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
      await expect(request.app.stateWithDefinition).resolves.toEqual({ ...purged, state: null })
    })

    it('attaches the sole application ref to a GET - documents are keyed by reference, so every request must name one', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])
      const request = makeRequest({
        query: { parcelId: 'SD1' },
        routePath: SUB_PAGE,
        path: '/test-grant/remove-parcel',
        app: { stateWithDefinition: Promise.resolve(multiGrant()) }
      })

      const result = await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/remove-parcel?parcelId=SD1&ref=REF-1')
      expect(result).toBe(takeover)
      expect(request.app.stateWithDefinition).toBeUndefined()
    })

    it('scopes a POST to the sole application in place, keeping its payload', async () => {
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/page', method: 'post' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(h.redirect).not.toHaveBeenCalled()
      expect(request.app.referenceNumber).toBe('REF-1')
    })

    it('attaches the sole live ref even when the unscoped read landed on a purged sibling (the list hides purged documents)', async () => {
      getStateWithDefinition.mockResolvedValue(
        multiGrant({
          applicationRef: 'REF-PURGED',
          allowMultipleApplications: true,
          state: { applicationStatus: 'PURGED' }
        })
      )
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-LIVE' }])
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/tasks' })

      await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/tasks?ref=REF-LIVE')
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

  describe('the allowMultipleApplications flag changing', () => {
    it('false -> true takes effect at once: the lone, still version-keyed application gets its ref attached', async () => {
      getStateWithDefinition.mockResolvedValue(
        multiGrant({ applicationRef: 'REF-1', allowMultipleApplications: false, state: {} })
      )
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }])
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/tasks' })

      await multiApplicationRedirect(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/test-grant/tasks?ref=REF-1')
    })

    it('true -> false with one application: stays scoped until its next save re-keys the document (it really is still keyed by reference)', async () => {
      getStateWithDefinition.mockResolvedValue(
        singleGrant({ applicationRef: 'REF-1', allowMultipleApplications: true, state: {} })
      )
      const request = makeRequest({ query: { ref: 'REF-1' }, routePath: SUB_PAGE, path: '/test-grant/tasks' })

      const result = await multiApplicationRedirect(request, h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })

    it('true -> false with several applications keeps treating the grant as multi-application', async () => {
      getStateWithDefinition.mockResolvedValue(
        singleGrant({ applicationRef: 'REF-1', allowMultipleApplications: true, state: {} })
      )
      listApplicationsFromApi.mockResolvedValue([{ applicationRef: 'REF-1' }, { applicationRef: 'REF-2' }])
      const request = makeRequest({ routePath: SUB_PAGE, path: '/test-grant/tasks' })

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

    it('continues on the root without listing applications either - no new dependency for the existing flow', async () => {
      const result = await multiApplicationRedirect(makeRequest(), h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
      expect(h.redirect).not.toHaveBeenCalled()
    })

    it('continues on the root with no document yet (new application)', async () => {
      getStateWithDefinition.mockResolvedValue(singleGrant(null))

      const result = await multiApplicationRedirect(makeRequest(), h)

      expect(result).toBe(h.continue)
      expect(listApplicationsFromApi).not.toHaveBeenCalled()
    })

    it('sends the root to the selector when the sbi holds several ref-keyed documents (the backend marks them)', async () => {
      getStateWithDefinition.mockResolvedValue(
        singleGrant({ applicationRef: 'REF-2', allowMultipleApplications: true, state: {} })
      )
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

it('reaches the selector without opening a state document even when an editing read would be locked', async () => {
  getRoutingDefinition.mockResolvedValueOnce({ definition: { allowMultipleApplications: true }, state: null })
  getStateWithDefinition.mockRejectedValueOnce(Object.assign(new Error('Locked'), { statusCode: 423 }))
  listApplicationsFromApi.mockResolvedValueOnce([{ applicationRef: 'REF-1' }, { applicationRef: 'REF-2' }])
  const request = {
    method: 'get',
    route: { path: ROOT },
    params: { slug: 'test-grant' },
    path: '/test-grant',
    query: {},
    app: {}
  }
  const h = { continue: Symbol('continue'), redirect: vi.fn().mockReturnValue({ takeover: () => 'selector' }) }
  const priorReads = getStateWithDefinition.mock.calls.length
  expect(await multiApplicationRedirect(request, h)).toBe('selector')
  expect(h.redirect).toHaveBeenCalledWith('/test-grant/applications')
  expect(getStateWithDefinition.mock.calls.length).toBe(priorReads)
})

it.each([0, 1])('routes %i applications from a lock-free root read', async (count) => {
  getRoutingDefinition.mockResolvedValueOnce({ definition: { allowMultipleApplications: true }, state: null })
  listApplicationsFromApi.mockResolvedValueOnce(count ? [{ applicationRef: 'REF-ONLY' }] : [])
  const request = {
    method: 'get',
    route: { path: ROOT },
    params: { slug: 'test-grant' },
    path: '/test-grant',
    url: new URL('http://localhost:3000/test-grant'),
    query: {},
    app: {}
  }
  const h = { continue: Symbol('continue'), redirect: vi.fn().mockReturnValue({ takeover: () => 'scoped' }) }
  const priorReads = getStateWithDefinition.mock.calls.length
  expect(await multiApplicationRedirect(request, h)).toBe(count ? 'scoped' : h.continue)
  expect(getStateWithDefinition.mock.calls.length).toBe(priorReads)
  if (count) {
    expect(h.redirect).toHaveBeenCalledWith('/test-grant?ref=REF-ONLY')
  } else {
    expect(await request.app.stateWithDefinition).toMatchObject({ state: null })
  }
})
