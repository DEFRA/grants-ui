import { formatUnit } from './format-unit.js'

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
