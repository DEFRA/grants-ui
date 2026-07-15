import { describe, it, expect } from 'vitest'
import { attempt, attemptSync } from './attempt.js'

describe('attempt', () => {
  it('returns the resolved value on success', async () => {
    const result = await attempt(() => Promise.resolve('parcels'))

    expect(result).toEqual({ ok: true, value: 'parcels' })
  })

  it('captures a rejected Error rather than throwing', async () => {
    const boom = new Error('upstream exploded')

    const result = await attempt(() => Promise.reject(boom))

    expect(result).toEqual({ ok: false, error: boom })
  })

  it('captures a synchronous throw from the callback', async () => {
    const result = await attempt(() => {
      throw new Error('threw before awaiting')
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.message).toBe('threw before awaiting')
  })

  it('wraps a non-Error rejection so callers always get a message', async () => {
    // eslint-disable-next-line prefer-promise-reject-errors -- the non-Error rejection is the thing under test
    const result = await attempt(() => Promise.reject('just a string'))

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toBeInstanceOf(Error)
    expect(result.ok === false && result.error.message).toBe('just a string')
  })

  it('preserves a falsy resolved value', async () => {
    const result = await attempt(() => Promise.resolve(0))

    expect(result).toEqual({ ok: true, value: 0 })
  })

  it('renders a thrown object readably instead of [object Object]', async () => {
    // eslint-disable-next-line prefer-promise-reject-errors -- the non-Error rejection is the thing under test
    const result = await attempt(() => Promise.reject({ statusCode: 503, detail: 'upstream down' }))

    expect(result.ok).toBe(false)
    const message = result.ok === false ? result.error.message : ''
    expect(message).not.toContain('[object Object]')
    expect(message).toContain('503')
    expect(message).toContain('upstream down')
  })

  it('survives a circular thrown object', async () => {
    /** @type {Record<string, unknown>} */
    const circular = { name: 'loop' }
    circular.self = circular

    const result = await attempt(() => Promise.reject(circular))

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error.message).toContain('loop')
  })
})

describe('attemptSync', () => {
  it('returns the value on success', () => {
    expect(attemptSync(() => 42)).toEqual({ ok: true, value: 42 })
  })

  it('captures a thrown Error', () => {
    const boom = new Error('bad tile')

    expect(
      attemptSync(() => {
        throw boom
      })
    ).toEqual({ ok: false, error: boom })
  })

  it('wraps a non-Error throw', () => {
    const result = attemptSync(() => {
      // eslint-disable-next-line no-throw-literal -- the non-Error throw is the thing under test
      throw 'not an error'
    })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toBeInstanceOf(Error)
    expect(result.ok === false && result.error.message).toBe('not an error')
  })
})
