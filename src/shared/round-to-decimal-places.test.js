import { describe, expect, it } from 'vitest'
import { roundToFourDecimalPlaces } from './round-to-decimal-places.js'

describe('roundToFourDecimalPlaces', () => {
  it('removes floating point noise from a sum', () => {
    expect(roundToFourDecimalPlaces(0.1 + 0.2)).toBe(0.3)
    expect(roundToFourDecimalPlaces(0.7 + 0.1)).toBe(0.8)
    expect(roundToFourDecimalPlaces(25.3874 + 169.8586)).toBe(195.246)
  })

  it('leaves a value already at 4 decimal places unchanged', () => {
    expect(roundToFourDecimalPlaces(12.3456)).toBe(12.3456)
  })

  it('rounds half up beyond 4 decimal places', () => {
    expect(roundToFourDecimalPlaces(9.12345678)).toBe(9.1235)
    expect(roundToFourDecimalPlaces(9.12344999)).toBe(9.1234)
  })

  it('returns 0 for 0', () => {
    expect(roundToFourDecimalPlaces(0)).toBe(0)
  })
})
