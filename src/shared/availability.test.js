import { getAvailabilityLimit } from './availability.js'

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
