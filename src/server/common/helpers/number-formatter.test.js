import { formatNumberAnswer, getNumberFormatter } from './number-formatter.js'

describe('getNumberFormatter', () => {
  test.each([
    [undefined],
    ['unknown'],
    ['decimal:'],
    ['decimal:2,3'],
    ['decimal:1:2'],
    ['decimal:-1'],
    ['decimal:1.5'],
    ['decimal:101'],
    ['thousands:2'],
    ['decimal:4|currency:gbp'],
    ['currency'],
    ['currency:gbp,'],
    ['currency:gbp,2,3'],
    ['currency:zzz'],
    ['currency:gbp,101']
  ])('returns undefined for invalid format %s', (format) => {
    expect(getNumberFormatter(format)).toBeUndefined()
  })

  test.each([
    ['thousands', '125000.500', '125,000.500'],
    ['decimal:0', 125000.5, '125,001'],
    ['decimal:4', 125000.5, '125,000.5000'],
    ['currency:gbp', 125000.5, '£125,000.50'],
    ['currency:gbp', -1.005, '-£1.01'],
    ['currency:gbp,0', 125000.5, '£125,001'],
    ['currency:jpy', 125000.5, 'JP¥125,001'],
    [' currency: gbp , 4 ', 125000.5, '£125,000.5000']
  ])('formats %s', (format, value, expected) => {
    expect(getNumberFormatter(format)(value)).toBe(expected)
  })

  test('supports the upper precision boundary', () => {
    expect(getNumberFormatter('decimal:100')(1.5)).toBe(`1.5${'0'.repeat(99)}`)
  })

  test('returns non-numeric values unchanged', () => {
    expect(getNumberFormatter('decimal')('not a number')).toBe('not a number')
  })
})

describe('formatNumberAnswer', () => {
  test.each([null, undefined])('returns an empty string for a missing answer: %s', (value) => {
    expect(formatNumberAnswer({ type: 'NumberField', options: { format: 'thousands' } }, value)).toBe('')
  })
})
