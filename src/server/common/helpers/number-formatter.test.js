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
    ['thousands|'],
    ['thousands|prefix'],
    ['thousands|suffix|suffix'],
    ['thousands|suffix,other'],
    ['unknown|suffix'],
    ['|suffix'],
    ['decimal:2,3|suffix'],
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
  test.each([
    ['thousands|suffix', 100000, 'm³', '100,000m³'],
    ['thousands|suffix', '125000.500', 'm³', '125,000.500m³'],
    ['decimal|suffix', 125000.5, 'm³', '125,000.50m³'],
    ['decimal:4|suffix', -125000.5, 'm³', '-125,000.5000m³'],
    ['currency:gbp,2|suffix', 125000.5, ' per year', '£125,000.50 per year'],
    [' thousands | suffix ', 0, 'm³', '0m³'],
    ['thousands|suffix', 100000, undefined, '100,000'],
    ['thousands|suffix', 100000, '', '100,000'],
    ['thousands', 100000, 'm³', '100,000'],
    ['thousands|suffix', '', 'm³', ''],
    ['decimal|suffix', '  ', 'm³', '  '],
    ['thousands|suffix', 'invalid', 'm³', 'invalid']
  ])('formats %s with value %j and suffix %j', (format, value, suffix, expected) => {
    expect(formatNumberAnswer({ type: 'NumberField', options: { format, suffix } }, value)).toBe(expected)
  })

  test('reuses the cached formatter without sharing component suffixes', () => {
    const format = 'thousands|suffix'
    const component = (suffix) => ({ type: 'NumberField', options: { format, suffix } })
    expect(formatNumberAnswer(component('m³'), 100000)).toBe('100,000m³')
    expect(formatNumberAnswer(component('ha'), 100000)).toBe('100,000ha')
    expect(formatNumberAnswer(component(), 100000)).toBe('100,000')
  })

  test.each([null, undefined])('returns an empty string for a missing answer: %s', (value) => {
    expect(formatNumberAnswer({ type: 'NumberField', options: { format: 'thousands' } }, value)).toBe('')
    expect(
      formatNumberAnswer({ type: 'NumberField', options: { format: 'thousands|suffix', suffix: 'm³' } }, value)
    ).toBe('')
  })
})
