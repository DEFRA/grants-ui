import { getAvailabilityLimit, isActionAvailable } from './availability.js'

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

describe('isActionAvailable', () => {
  it.each([
    ['an available action with zero area', { isAvailable: true, availability: { value: 0, unit: 'ha' } }, true],
    [
      'an unavailable action with positive area',
      { isAvailable: false, availability: { value: 18.5, unit: 'ha' } },
      false
    ],
    ['an available non-area action', { isAvailable: true, availability: { value: null, unit: 'count' } }, true],
    ['an unavailable non-area action', { isAvailable: false, availability: { value: null, unit: 'count' } }, false],
    ['no quantity limit', { isAvailable: true }, true],
    ['a missing flag', { availability: { value: 18.5, unit: 'ha' } }, false],
    ['a missing action', undefined, false],
    ['a null action', null, false],
    [
      'an available action with zero static availability',
      { isAvailable: true, staticAvailability: { value: 0, unit: 'ha' } },
      true
    ],
    [
      'an unavailable action with positive static availability',
      { isAvailable: false, staticAvailability: { value: 4, unit: 'ha' } },
      false
    ]
  ])('reads %s as %j', (_case, action, expected) => {
    expect(isActionAvailable(action)).toBe(expected)
  })
})
