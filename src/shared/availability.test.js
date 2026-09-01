import { getAvailabilityLimit, hasAvailableLand } from './availability.js'

describe('getAvailabilityLimit', () => {
  it.each([
    [{ value: 18.5, unit: 'ha' }, 18.5],
    [{ value: 0, unit: 'ha' }, 0],
    [{ value: null, unit: 'ha' }, undefined],
    [null, undefined],
    [undefined, undefined]
  ])('reads %j as %j', (availability, expected) => {
    expect(getAvailabilityLimit(availability)).toBe(expected)
  })
})

describe('hasAvailableLand', () => {
  it.each([
    ['a positive availability', { availability: { value: 18.5, unit: 'ha' } }, true],
    ['a zero availability', { availability: { value: 0, unit: 'ha' } }, false],
    ['an unrestricted availability', { availability: { value: null, unit: 'ha' } }, true],
    ['no availability at all', {}, true],
    ['a missing action', undefined, true],
    [
      'staticAvailability winning over a recomputed 0',
      { availability: { value: 0, unit: 'ha' }, staticAvailability: { value: 4, unit: 'ha' } },
      true
    ],
    [
      'a zero staticAvailability, whatever availability says',
      { availability: { value: 4, unit: 'ha' }, staticAvailability: { value: 0, unit: 'ha' } },
      false
    ]
  ])('reads %s as %j', (_case, action, expected) => {
    expect(hasAvailableLand(action)).toBe(expected)
  })
})
