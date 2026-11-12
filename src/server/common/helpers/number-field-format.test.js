import { formatNumberAnswer } from './number-field-format.js'

describe('formatNumberAnswer', () => {
  test.each([
    [125000.5, '125000.50', '125,000.50'],
    [125000.5, '125000.25', '125,000.5'],
    [1200, '12e2', '1,200']
  ])('uses retained precision only when it matches the saved answer: %s, %s', (value, rawInput, expected) => {
    expect(formatNumberAnswer({ type: 'NumberField', options: { format: 'thousands' } }, value, rawInput)).toBe(
      expected
    )
  })

  test.each([null, undefined])('returns an empty string for a missing answer: %s', (value) => {
    expect(formatNumberAnswer({ type: 'NumberField', options: { format: 'thousands' } }, value)).toBe('')
  })
})
