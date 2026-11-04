import { formatNumberAnswer } from './number-field-format.js'

describe('formatNumberAnswer', () => {
  test.each([
    [{ type: 'NumberField', format: 'thousands' }, 125000.5, '125000.50', '125,000.50'],
    [{ type: 'NumberField', format: 'thousands' }, '.5', '+.500', '+0.500'],
    [{ type: 'NumberField', format: 'thousands' }, 1200, '12e2', '1,200'],
    [{ type: 'NumberField', format: 'thousands' }, 0, undefined, '0'],
    [{ type: 'NumberField', format: 'thousands' }, -125000.5, undefined, '-125,000.5'],
    [{ type: 'NumberField', format: 'thousands' }, 125000.5, '125000.25', '125,000.5'],
    [{ type: 'NumberField' }, 125000.5, '125000.50', '125000.5'],
    [{ type: 'TextField', format: 'thousands' }, '125000.50', undefined, '125000.50']
  ])('formats configured answers', (component, value, rawInput, expected) => {
    expect(formatNumberAnswer(component, value, rawInput)).toBe(expected)
  })

  test.each([
    ['percent', 0, '0%'],
    ['percent', 1, '100%'],
    ['percent', -0.125, '-12.5%'],
    ['percent', 0.12345, '12.35%'],
    ['decimal', 0, '0.00'],
    ['decimal', -125000.5, '-125,000.50'],
    ['decimal', 1.005, '1.01'],
    ['currency-gbp', 0, '£0.00'],
    ['currency-gbp', -125000.5, '-£125,000.50'],
    ['currency-gbp', 1.005, '£1.01']
  ])('formats %s value %s as %s', (format, value, expected) => {
    expect(formatNumberAnswer({ type: 'NumberField', format }, value)).toBe(expected)
  })

  test.each([[null], [undefined], [{ amount: 125000 }], [[125000]]])('returns an empty string for %s', (value) => {
    expect(formatNumberAnswer({ type: 'NumberField', format: 'thousands' }, value)).toBe('')
  })
})
