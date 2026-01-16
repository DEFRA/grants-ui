import { syntheticError } from './synthetic-error.js'

describe('syntheticError', () => {
  it('creates an Error object', () => {
    const err = syntheticError('boom')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
  })

  it('has a stack trace', () => {
    const err = syntheticError('stack pls')
    expect(typeof err.stack).toBe('string')
    expect(err.stack.length).toBeGreaterThan(0)
  })
})
