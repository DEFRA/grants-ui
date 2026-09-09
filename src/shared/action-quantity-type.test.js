import { requiresQuantityInput } from './action-quantity-type.js'

describe('requiresQuantityInput', () => {
  it.each([
    ['requires a quantity when quantityRequired is true', { quantityRequired: true }, true],
    ['does not require a quantity when quantityRequired is false', { quantityRequired: false }, false],
    ['does not require a quantity when quantityRequired is absent', {}, false],
    ['does not require a quantity when the action is missing', undefined, false],
    ['ignores availability type and unit', { availability: { type: 'partial', unit: 'sqm' } }, false]
  ])('%s', (_description, action, expected) => {
    expect(requiresQuantityInput(action)).toBe(expected)
  })
})
