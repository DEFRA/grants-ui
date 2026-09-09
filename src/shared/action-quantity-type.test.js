import { requiresQuantityInput } from './action-quantity-type.js'

describe('requiresQuantityInput', () => {
  it.each([
    ['undefined action', undefined, false],
    ['partial availability without the flag', { availability: { type: 'partial', unit: 'ha' } }, false],
    ['non-partial availability', { availability: { type: 'total', unit: 'ha' } }, false],
    ['explicit true', { quantityRequired: true, availability: { type: 'total', unit: 'ha' } }, true],
    [
      'explicit false over partial availability',
      { quantityRequired: false, availability: { type: 'partial', unit: 'ha' } },
      false
    ],
    [
      'explicit false over a whole-number unit',
      { quantityRequired: false, availability: { type: 'total', unit: 'sqm' } },
      false
    ],
    ['square-metre unit without the flag', { availability: { type: 'total', unit: 'sqm' } }, false],
    ['count unit without the flag', { availability: { type: 'total', unit: 'count' } }, false]
  ])('%s returns the expected input requirement', (_description, action, expected) => {
    expect(requiresQuantityInput(action)).toBe(expected)
  })
})
