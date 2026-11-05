import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Hapi from '@hapi/hapi'
import { Engine as CatboxMemory } from '@hapi/catbox-memory'
import { config } from '~/src/config/config.js'
import { defineCachedMethod, retryWindowMs } from './cached-method.js'

describe('defineCachedMethod', () => {
  /** @type {import('@hapi/hapi').Server} */
  let server

  beforeEach(() => {
    server = Hapi.server({ cache: [{ name: config.get('session.cache.name'), engine: new CatboxMemory() }] })
  })

  afterEach(async () => {
    vi.useRealTimers()
    await server.stop()
  })

  it('throws when called before it is registered', () => {
    const method = defineCachedMethod('test.unregistered', vi.fn(), {
      expiresIn: 1000,
      generateTimeout: 1000,
      generateKey: () => 'key'
    })

    expect(() => method.call()).toThrow('Cached method test.unregistered is not registered')
  })

  it('caches results in the session cache provision, keyed by generateKey', async () => {
    const fn = vi.fn(async (id, _token) => ({ id }))
    const method = defineCachedMethod('test.lookup', fn, {
      expiresIn: 1000,
      generateTimeout: 1000,
      generateKey: (id) => id
    })
    method.register(server)
    await server.initialize()

    expect(await method.call('a', 'token-1')).toEqual({ id: 'a' })
    expect(await method.call('a', 'token-2')).toEqual({ id: 'a' })
    expect(await method.call('b', 'token-1')).toEqual({ id: 'b' })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(server.methods.test.lookup).toBeTypeOf('function')
  })

  it('drops one key', async () => {
    const fn = vi.fn(async (id) => id)
    const method = defineCachedMethod('test.drop', fn, {
      expiresIn: 1000,
      generateTimeout: 1000,
      generateKey: (id) => id
    })
    method.register(server)
    await server.initialize()

    await method.call('a')
    await method.call('b')
    await method.drop('a')
    await method.call('a')
    await method.call('b')

    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('lets fn override the TTL for one result through flags.ttl', async () => {
    vi.useFakeTimers()
    const fn = vi.fn(async (flags) => {
      flags.ttl = 100
      return 'value'
    })
    const method = defineCachedMethod('test.ttl', fn, {
      expiresIn: 60 * 1000,
      generateTimeout: 1000,
      generateKey: () => 'key'
    })
    method.register(server)
    await server.initialize()

    await method.call()
    vi.advanceTimersByTime(101)
    await method.call()

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('fails with a 503 when the call outlasts generateTimeout', async () => {
    const method = defineCachedMethod('test.slow', () => new Promise((resolve) => setTimeout(resolve, 50)), {
      expiresIn: 1000,
      generateTimeout: 10,
      generateKey: () => 'slow'
    })
    method.register(server)
    await server.initialize()

    await expect(method.call()).rejects.toMatchObject({ output: { statusCode: 503 } })
  })
})

describe('retryWindowMs', () => {
  it('covers every attempt timing out plus the backoff between them', () => {
    expect(retryWindowMs(30 * 1000)).toBe(93 * 1000)
  })
})
