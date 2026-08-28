import { describe, it, expect } from 'vitest'
import { formatArea } from './format-area.js'

describe('formatArea', () => {
  it('pads a numeric area to four decimal places and appends the unit', () => {
    expect(formatArea(2, 'ha')).toBe('2.0000 ha')
    expect(formatArea(31.89, 'hectares')).toBe('31.8900 hectares')
  })

  it('shows a claimed-out area as an explicit 0.0000', () => {
    expect(formatArea(0, 'hectares')).toBe('0.0000 hectares')
  })

  it('rounds beyond four decimal places rather than printing float noise', () => {
    expect(formatArea(0.32712345, 'ha')).toBe('0.3271 ha')
  })

  it('passes a non-numeric quantity through unchanged rather than validating it', () => {
    expect(formatArea('12.5', 'ha')).toBe('12.5 ha')
    expect(formatArea(Number.NaN, 'ha')).toBe('NaN ha')
  })

  it('skips a missing half instead of printing "undefined"', () => {
    expect(formatArea(2, undefined)).toBe('2.0000')
    expect(formatArea(2, '')).toBe('2.0000')
    expect(formatArea(undefined, 'ha')).toBe('ha')
    expect(formatArea(null, null)).toBe('')
  })
})
