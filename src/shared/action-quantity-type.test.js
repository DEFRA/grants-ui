import { requiresQuantityInput } from './action-quantity-type.js'

describe('requiresQuantityInput', () => {
  // Deliberately `=== true`, not truthiness: only the API's own boolean flag
  // may put a quantity input on the page.
  it.each([
    [true, true],
    [false, false],
    [undefined, false],
    [null, false],
    ['true', false],
    [1, false]
  ])('reads %j as %j', (inputRequired, expected) => {
    expect(requiresQuantityInput(inputRequired)).toBe(expected)
  })
})
