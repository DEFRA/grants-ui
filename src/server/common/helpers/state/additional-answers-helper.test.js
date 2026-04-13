import { mergeAdditionalAnswers } from './additional-answers-helper.js'

describe('mergeAdditionalAnswers', () => {
  it('creates additionalAnswers when state has none', () => {
    const state = { someKey: 'value' }
    const result = mergeAdditionalAnswers(state, { foo: 'bar' })
    expect(result).toEqual({
      someKey: 'value',
      additionalAnswers: { foo: 'bar' }
    })
  })

  it('creates additionalAnswers when state.additionalAnswers is undefined', () => {
    const state = { additionalAnswers: undefined }
    const result = mergeAdditionalAnswers(state, { foo: 'bar' })
    expect(result).toEqual({ additionalAnswers: { foo: 'bar' } })
  })

  it('merges into existing additionalAnswers without losing other keys', () => {
    const state = { additionalAnswers: { existing: 'value' } }
    const result = mergeAdditionalAnswers(state, { newKey: 42 })
    expect(result.additionalAnswers).toEqual({ existing: 'value', newKey: 42 })
  })

  it('overwrites matching keys with values from newAnswers', () => {
    const state = { additionalAnswers: { totalHectaresAppliedFor: 10, applicant: 'old' } }
    const result = mergeAdditionalAnswers(state, { totalHectaresAppliedFor: 99 })
    expect(result.additionalAnswers).toEqual({ totalHectaresAppliedFor: 99, applicant: 'old' })
  })

  it('merges multiple keys at once', () => {
    const state = { additionalAnswers: { a: 1 } }
    const result = mergeAdditionalAnswers(state, { b: 2, c: 3 })
    expect(result.additionalAnswers).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('preserves all other state keys', () => {
    const state = { landParcels: ['S1-P1'], totalHectaresAppliedFor: 5, additionalAnswers: {} }
    const result = mergeAdditionalAnswers(state, { foo: 'bar' })
    expect(result.landParcels).toEqual(['S1-P1'])
    expect(result.totalHectaresAppliedFor).toBe(5)
  })

  it('does not mutate the original state', () => {
    const state = { additionalAnswers: { existing: 'value' } }
    mergeAdditionalAnswers(state, { newKey: 1 })
    expect(state.additionalAnswers).toEqual({ existing: 'value' })
  })
})
