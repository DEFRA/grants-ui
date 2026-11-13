import { getNumberDisplayValue } from './number-display-value.js'

describe('getNumberDisplayValue', () => {
  test.each([
    [125000.5, '125000.50', '125000.50'],
    ['125000.5', '125000.50', '125000.50'],
    [0, '0.00', '0.00'],
    ['0.00', '0.000', '0.000']
  ])('uses matching entered decimal text: %s, %s', (storedValue, enteredText, expected) => {
    expect(getNumberDisplayValue(storedValue, enteredText)).toBe(expected)
  })

  test.each([
    [125000.5, '125000.25'],
    [1200, '12e2'],
    [1200, 'not a number'],
    [null, '0'],
    [undefined, '0'],
    ['', '0'],
    ['not a number', '0']
  ])('keeps stored value when entered text cannot be retained: %s, %s', (storedValue, enteredText) => {
    expect(getNumberDisplayValue(storedValue, enteredText)).toBe(storedValue)
  })

  test('keeps missing entered text from replacing a saved value', () => {
    expect(getNumberDisplayValue(12.5, undefined)).toBe(12.5)
  })
})
