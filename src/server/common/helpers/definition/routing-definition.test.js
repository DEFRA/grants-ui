import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { getRoutingDefinition, tryRoutingDefinition } from './routing-definition.js'
import { rememberMultipleApplications, cachedMultipleApplications } from './multiple-applications-cache.js'
import { fetchLatestDefinitionFromApi } from '../state/fetch-saved-state-helper.js'

vi.mock('../state/fetch-saved-state-helper.js', () => ({ fetchLatestDefinitionFromApi: vi.fn() }))
vi.mock('../state/get-cache-key-helper.js', () => ({
  getCacheKey: (request) => ({ grantCode: request.params.slug }),
  getReferenceNumber: vi.fn()
}))

let grantCounter = 0
const requestFor = (grantCode) => ({ app: {}, params: { slug: grantCode } })
let grantCode
beforeEach(() => {
  vi.clearAllMocks()
  grantCode = `routing-test-${++grantCounter}`
})
afterEach(() => vi.useRealTimers())

describe('definition routing', () => {
  it('skips the extra definition request for a known single-application grant', async () => {
    rememberMultipleApplications(grantCode, { allowMultipleApplications: false })
    expect(await tryRoutingDefinition(requestFor(grantCode))).toBeNull()
    expect(fetchLatestDefinitionFromApi).not.toHaveBeenCalled()
  })

  it('fetches for an unknown grant and remembers its flag for later root visits', async () => {
    fetchLatestDefinitionFromApi.mockResolvedValue({ allowMultipleApplications: false })
    await tryRoutingDefinition(requestFor(grantCode))
    await tryRoutingDefinition(requestFor(grantCode))
    expect(fetchLatestDefinitionFromApi).toHaveBeenCalledTimes(1)
    expect(cachedMultipleApplications(grantCode)).toBe(false)
  })

  it('keeps known multi-application root reads lock-free', async () => {
    rememberMultipleApplications(grantCode, { allowMultipleApplications: true })
    fetchLatestDefinitionFromApi.mockResolvedValue({ allowMultipleApplications: true })
    expect(await tryRoutingDefinition(requestFor(grantCode))).toMatchObject({ state: null })
    expect(fetchLatestDefinitionFromApi).toHaveBeenCalledExactlyOnceWith(grantCode)
  })

  it('expires a cached false flag so enabling multiple applications is detected', async () => {
    vi.useFakeTimers()
    rememberMultipleApplications(grantCode, { allowMultipleApplications: false })
    vi.advanceTimersByTime(60_001)
    fetchLatestDefinitionFromApi.mockResolvedValue({ allowMultipleApplications: true })
    expect(await tryRoutingDefinition(requestFor(grantCode))).toMatchObject({
      definition: { allowMultipleApplications: true }
    })
    expect(cachedMultipleApplications(grantCode)).toBe(true)
  })

  it('does not extend expiry when repeated state reads report the same flag', () => {
    vi.useFakeTimers()
    rememberMultipleApplications(grantCode, { allowMultipleApplications: false })
    vi.advanceTimersByTime(30_000)
    rememberMultipleApplications(grantCode, { allowMultipleApplications: false })
    vi.advanceTimersByTime(30_001)
    expect(cachedMultipleApplications(grantCode)).toBeUndefined()
  })

  it('falls back on failure without retrying the failed definition call within a request', async () => {
    const request = requestFor(grantCode)
    fetchLatestDefinitionFromApi.mockRejectedValue(new Error('Backend unavailable'))
    expect(await tryRoutingDefinition(request)).toBeNull()
    expect(await tryRoutingDefinition(request)).toBeNull()
    expect(fetchLatestDefinitionFromApi).toHaveBeenCalledTimes(1)
    await expect(getRoutingDefinition(request)).rejects.toMatchObject({ details: { status: 502 } })
  })
})
