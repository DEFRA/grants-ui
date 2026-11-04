import { getNumberFormatter } from './number-formatter.js'

describe('getNumberFormatter', () => {
  test.each([
    [undefined],
    [null],
    [125],
    [''],
    [' '],
    ['unknown'],
    ['DECIMAL'],
    ['decimal:'],
    ['decimal:2,3'],
    ['decimal:1:2'],
    ['decimal:-1'],
    ['decimal:+1'],
    ['decimal:1.5'],
    ['decimal:1e2'],
    ['decimal:101'],
    ['decimal:NaN'],
    ['|decimal'],
    ['decimal|'],
    [':4'],
    ['thousands:2'],
    ['thousands,decimal'],
    ['decimal||percent'],
    ['decimal:4|currency:gbp'],
    ['thousands|thousands'],
    ['currency'],
    ['currency:'],
    ['currency:gbp,'],
    ['currency:gbp,2,3'],
    ['currency:gb'],
    ['currency:US1'],
    ['currency:not-real'],
    ['currency:zzz'],
    ['currency:gbp,-1'],
    ['currency:gbp,101'],
    ['currency:"gbp"']
  ])('returns undefined for invalid format %s', (format) => {
    expect(getNumberFormatter(format)).toBeUndefined()
  })

  test.each([
    ['thousands', '125000.500', '125,000.500'],
    ['thousands', '+.500', '+0.500'],
    ['decimal', 125000.5, '125,000.50'],
    ['decimal:0', 125000.5, '125,001'],
    ['decimal:4', 125000.5, '125,000.5000'],
    ['percent', 0.12345, '12.35%'],
    ['percent:0', 0.125, '13%'],
    ['percent:4', 0.125, '12.5000%'],
    ['currency:gbp', 125000.5, '£125,000.50'],
    ['currency:gbp,4', 125000.5, '£125,000.5000'],
    ['currency:gbp,0', 125000.5, '£125,001'],
    ['currency:jpy', 125000.5, 'JP¥125,001']
  ])('formats %s', (format, value, expected) => {
    expect(getNumberFormatter(format)(value)).toBe(expected)
  })

  test('places a negative sign before a currency prefix', () => {
    expect(getNumberFormatter('currency:gbp')(-1)).toBe('-£1.00')
  })

  test('trims formatter names and arguments', () => {
    expect(getNumberFormatter(' currency: gbp , 4 ')(125000.5)).toBe('£125,000.5000')
  })

  test('does not convert currency values', () => {
    expect(getNumberFormatter('currency:usd')(1)).toBe('US$1.00')
  })

  test('supports the upper precision boundary', () => {
    expect(getNumberFormatter('decimal:100')(1.5)).toBe(`1.5${'0'.repeat(99)}`)
  })

  test('returns non-numeric values unchanged', () => {
    expect(getNumberFormatter('decimal')('not a number')).toBe('not a number')
  })
})
