import { getNumberFormatter } from './number-format-pipeline.js'

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

  test('inherits explicit precision in a currency pipeline', () => {
    const formatter = getNumberFormatter('decimal:4|currency:gbp')

    expect(formatter(125000.5)).toBe('£125,000.5000')
  })

  test.each([
    ['thousands', '125000.500', '125,000.500'],
    ['thousands', '+.500', '+0.500'],
    ['decimal', 125000.5, '125,000.50'],
    ['decimal:0', 125000.5, '125,001'],
    ['decimal:4', 125000.5, '125,000.5000'],
    ['percent', 0.12345, '12.35%'],
    ['percent:4', 0.125, '12.5000%'],
    ['currency:gbp', 125000.5, '£125,000.50'],
    ['currency:gbp,4', 125000.5, '£125,000.5000'],
    ['currency:jpy', 125000.5, 'JP¥125,001']
  ])('formats %s', (format, value, expected) => {
    expect(getNumberFormatter(format)(value)).toBe(expected)
  })

  test('places a negative sign before a currency prefix', () => {
    expect(getNumberFormatter('currency:gbp')(-1)).toBe('-£1.00')
  })

  test.each([
    ['decimal:2|decimal:1', 1.249, '1.3'],
    ['decimal:1|decimal:2', 1.249, '1.20'],
    ['percent|percent', 0.125, '1,250%'],
    ['percent:4|currency:gbp', 0.125, '£12.5000'],
    ['currency:gbp|decimal:4', 125000.567, '£125,000.5700'],
    ['decimal|currency:jpy', 125000.5, 'JP¥125,000.50'],
    ['decimal:4|decimal|currency:gbp', 125000.5, '£125,000.50'],
    ['decimal:4|currency:gbp,0', 125000.5, '£125,001'],
    ['decimal:0|percent', 0.125, '0%'],
    ['currency:gbp|thousands', -1, '-£1.00']
  ])('applies stages left to right for %s', (format, value, expected) => {
    expect(getNumberFormatter(format)(value)).toBe(expected)
  })

  test.each([
    ['percent|decimal:4', 0.125, '12.5000%'],
    ['currency:gbp|decimal:4', 125000.5, '£125,000.5000'],
    ['currency:gbp|percent', 0.125, '13%'],
    ['percent|currency:gbp', 0.125, '£12.50']
  ])('retains or replaces decorations for %s', (format, value, expected) => {
    expect(getNumberFormatter(format)(value)).toBe(expected)
  })

  test('trims stage names and arguments', () => {
    expect(getNumberFormatter(' decimal: 4 | currency: gbp , 4 ')(125000.5)).toBe('£125,000.5000')
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
