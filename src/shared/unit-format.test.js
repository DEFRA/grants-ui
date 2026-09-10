import { describe, expect, it } from 'vitest'
import { areaWithUnit, availableArea, formatArea, formatUnit } from './unit-format.js'

describe('unit-format', () => {
  describe('areaWithUnit', () => {
    it('renders an area at four decimal places with its full unit name', () => {
      expect(areaWithUnit(39.81, 'ha')).toBe('39.8100 hectares')
    })

    it('rounds to 4dp rather than printing full float precision', () => {
      expect(areaWithUnit(0.32712345, 'ha')).toBe('0.3271 hectares')
    })

    it('uses the action own unit, not a hardcoded hectare', () => {
      expect(areaWithUnit(120, 'm')).toBe('120.0000 metres')
    })

    it.each([
      ['count', 'count'],
      ['sqm', 'square metres']
    ])('renders whole quantities for %s with its full unit name', (unit, label) => {
      expect(areaWithUnit(4, unit)).toBe(`4 ${label}`)
      expect(availableArea(0, unit)).toBe(`0 ${label} available`)
    })

    it('omits the unit entirely when there is none, rather than printing a gap', () => {
      expect(areaWithUnit(1, undefined)).toBe('1.0000')
    })
  })

  describe('availableArea', () => {
    it('reports a fully claimed action as an explicit 0.0000 available', () => {
      expect(availableArea(0, 'ha')).toBe('0.0000 hectares available')
    })

    it('reports leftover headroom as the available area', () => {
      expect(availableArea(2.5, 'ha')).toBe('2.5000 hectares available')
    })

    it('keeps the unit out of the text when the action has none', () => {
      expect(availableArea(1, undefined)).toBe('1.0000 available')
    })
  })
})

describe('formatArea', () => {
  it.each(['count', 'sqm'])('renders %s quantities without decimal places', (unit) => {
    expect(formatArea(4, unit)).toBe(`4 ${unit}`)
    expect(formatArea(0, unit)).toBe(`0 ${unit}`)
  })

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

describe('formatUnit', () => {
  it.each([
    ['ha', 'hectares'],
    ['sqm', 'square metres'],
    ['m', 'metres'],
    ['km', 'kilometres'],
    [' KM ', 'kilometres'],
    ['widgets', 'widgets'],
    [undefined, '']
  ])('formats %j as %j', (abbrev, expected) => {
    expect(formatUnit(abbrev)).toBe(expected)
  })
})
