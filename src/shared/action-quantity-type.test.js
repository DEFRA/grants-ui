import { requiresQuantityInput } from './action-quantity-type.js'

describe('requiresQuantityInput', () => {
  it.each([
    ['partial', true],
    ['total', false],
    [undefined, false],
    [null, false],
    ['PARTIAL', false],
    [1, false]
  ])('reads %j as %j', (availabilityType, expected) => {
    expect(requiresQuantityInput(availabilityType)).toBe(expected)
  })
})
