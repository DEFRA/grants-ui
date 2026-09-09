import { requiresQuantityInput } from './action-quantity-type.js'

describe('requiresQuantityInput', () => {
  it.each([
    ['does not require a quantity when the action is missing', undefined, false],
    [
      'does not infer a quantity requirement from partial availability when quantityRequired is absent',
      { availability: { type: 'partial', unit: 'ha' } },
      false
    ],
    [
      'does not require a quantity for total availability when quantityRequired is absent',
      { availability: { type: 'total', unit: 'ha' } },
      false
    ],
    [
      'requires a quantity when quantityRequired is true, even for total availability',
      { quantityRequired: true, availability: { type: 'total', unit: 'ha' } },
      true
    ],
    [
      'does not require a quantity when quantityRequired is false, even for partial availability',
      { quantityRequired: false, availability: { type: 'partial', unit: 'ha' } },
      false
    ],
    [
      'does not require a quantity when quantityRequired is false, even for square metres',
      { quantityRequired: false, availability: { type: 'total', unit: 'sqm' } },
      false
    ],
    [
      'does not infer a quantity requirement from square metres when quantityRequired is absent',
      { availability: { type: 'total', unit: 'sqm' } },
      false
    ],
    [
      'does not infer a quantity requirement from counts when quantityRequired is absent',
      { availability: { type: 'total', unit: 'count' } },
      false
    ]
  ])('%s', (_description, action, expected) => {
    expect(requiresQuantityInput(action)).toBe(expected)
  })
})
