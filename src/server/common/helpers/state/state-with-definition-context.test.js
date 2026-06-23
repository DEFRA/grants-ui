import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  bindRequestContext,
  currentRequest,
  enterRequestContext,
  getStateWithDefinition,
  isBackendSourcedSlug,
  resolveVersion,
  runWithRequest
} from './state-with-definition-context.js'
import { config } from '~/src/config/config.js'
import { fetchStateWithDefinitionFromApi } from './fetch-saved-state-helper.js'
import { mintLockToken } from '../lock/lock-token.js'
import { getCacheKey } from './get-cache-key-helper.js'

vi.mock('~/src/config/config.js', () => ({
  config: { get: vi.fn() }
}))

vi.mock('./fetch-saved-state-helper.js', () => ({
  fetchStateWithDefinitionFromApi: vi.fn()
}))

vi.mock('../lock/lock-token.js', () => ({
  mintLockToken: vi.fn(() => 'READ-LOCK')
}))

vi.mock('./get-cache-key-helper.js', () => ({
  getCacheKey: vi.fn(() => ({ sbi: 'biz-1', grantCode: 'grant-a' }))
}))

describe('state-with-definition-context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    config.get.mockReturnValue([])
    getCacheKey.mockReturnValue({ sbi: 'biz-1', grantCode: 'grant-a' })
  })

  const makeRequest = (credentials = { contactId: 'c1' }) => ({ app: {}, auth: { credentials } })

  describe('getStateWithDefinition (single-flight)', () => {
    it('issues exactly one backend call and memoizes the promise on request.app', async () => {
      const request = makeRequest()
      fetchStateWithDefinitionFromApi.mockResolvedValue({ state: { foo: 'bar' }, upgraded: false })

      const first = getStateWithDefinition(request)
      const second = getStateWithDefinition(request)

      expect(first).toBe(second)
      expect(request.app.stateWithDefinition).toBe(first)
      await first
      expect(fetchStateWithDefinitionFromApi).toHaveBeenCalledTimes(1)
    })

    it('builds a read lock token without grantVersion and requests definition for backend slugs', async () => {
      config.get.mockReturnValue(['grant-a'])
      const request = makeRequest()
      fetchStateWithDefinitionFromApi.mockResolvedValue({})

      await getStateWithDefinition(request)

      expect(mintLockToken).toHaveBeenCalledWith({ userId: 'c1', sbi: 'biz-1', grantCode: 'grant-a' })
      expect(fetchStateWithDefinitionFromApi).toHaveBeenCalledWith('biz-1:grant-a', request, {
        lockToken: 'READ-LOCK',
        includeDefinition: true
      })
    })

    it('requests state only (includeDefinition: false) for non-backend slugs', async () => {
      config.get.mockReturnValue([])
      const request = makeRequest()
      fetchStateWithDefinitionFromApi.mockResolvedValue({})

      await getStateWithDefinition(request)

      expect(fetchStateWithDefinitionFromApi).toHaveBeenCalledWith('biz-1:grant-a', request, {
        lockToken: 'READ-LOCK',
        includeDefinition: false
      })
    })

    it('throws when the user identity is missing for the lock token', () => {
      const request = makeRequest({})

      expect(() => getStateWithDefinition(request)).toThrow('Missing user identity for lock token')
    })
  })

  describe('resolveVersion', () => {
    it('returns toVersion when upgraded', () => {
      expect(resolveVersion({ upgraded: true, toVersion: '3.0.0', state: { grantVersion: '1.0.0' } })).toBe('3.0.0')
    })

    it('returns state.grantVersion when not upgraded', () => {
      expect(resolveVersion({ upgraded: false, state: { grantVersion: '1.2.3' } })).toBe('1.2.3')
    })

    it('derives semver from the definition when state has no version', () => {
      expect(resolveVersion({ upgraded: false, state: null, definition: { major: 2, minor: 1, patch: 0 } })).toBe(
        '2.1.0'
      )
    })

    it('returns undefined when nothing is resolvable', () => {
      expect(resolveVersion({ upgraded: false, state: null })).toBeUndefined()
      expect(resolveVersion(null)).toBeUndefined()
    })
  })

  describe('isBackendSourcedSlug', () => {
    it('returns true when the slug is configured', () => {
      config.get.mockReturnValue(['grant-a', 'grant-b'])
      expect(isBackendSourcedSlug('grant-a')).toBe(true)
    })

    it('returns false when the slug is not configured', () => {
      config.get.mockReturnValue(['grant-b'])
      expect(isBackendSourcedSlug('grant-a')).toBe(false)
    })
  })

  describe('request context (AsyncLocalStorage)', () => {
    it('exposes the request within runWithRequest', () => {
      const request = makeRequest()
      const seen = runWithRequest(request, () => currentRequest())
      expect(seen).toBe(request)
    })

    it('exposes the request after enterRequestContext within the same async scope', async () => {
      await runWithRequest({}, async () => {
        const request = makeRequest()
        enterRequestContext(request)
        expect(currentRequest()).toBe(request)
      })
    })
  })

  describe('bindRequestContext', () => {
    /**
     * Builds a minimal stand-in for a Hapi request exposing the internal
     * `_lifecycle` / `_postCycle` runners that the real engine drives.
     */
    const makeLifecycleRequest = () => {
      const request = makeRequest()
      /**
       * Each runner records the request visible via `currentRequest()` at
       * several async hops to prove the context survives scheduling boundaries.
       * @returns {Promise<Array<unknown>>}
       */
      const runner = async () => {
        const seen = [currentRequest()]
        await Promise.resolve()
        seen.push(currentRequest())
        await new Promise((resolve) => setTimeout(resolve, 1))
        seen.push(currentRequest())
        return seen
      }
      request._lifecycle = runner
      request._postCycle = runner
      return request
    }

    it('makes the request resolvable for the whole lifecycle runner', async () => {
      const request = makeLifecycleRequest()
      expect(currentRequest()).toBeUndefined()

      bindRequestContext(request)
      const seen = await request._lifecycle()

      expect(seen).toEqual([request, request, request])
      // The context does not leak outside the wrapped execution.
      expect(currentRequest()).toBeUndefined()
    })

    it('also covers the post-response cycle (onPreResponse)', async () => {
      const request = makeLifecycleRequest()
      bindRequestContext(request)

      const seen = await request._postCycle()

      expect(seen).toEqual([request, request, request])
    })

    it('isolates the context between concurrent requests', async () => {
      const requestA = makeLifecycleRequest()
      const requestB = makeLifecycleRequest()
      bindRequestContext(requestA)
      bindRequestContext(requestB)

      const [seenA, seenB] = await Promise.all([requestA._lifecycle(), requestB._lifecycle()])

      expect(seenA).toEqual([requestA, requestA, requestA])
      expect(seenB).toEqual([requestB, requestB, requestB])
    })

    it('ignores lifecycle runners that are not functions', () => {
      const request = makeRequest()
      expect(() => bindRequestContext(request)).not.toThrow()
    })
  })
})
