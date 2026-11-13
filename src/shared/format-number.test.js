import { formatThousands } from './format-number.js'

describe('formatThousands', () => {
  test.each([
    [125000.5, '125,000.5'],
    ['125000.50', '125,000.50'],
    ['0', '0'],
    ['+1234.', '+1,234.'],
    ['-.050', '-0.050'],
    ['1.25e+4', '1.25e+4'],
    ['12345678901234567890.123456789', '12,345,678,901,234,567,890.123456789']
  ])('formats %s as %s', (value, expected) => {
    expect(formatThousands(value)).toBe(expected)
  })

  test('returns non-numeric input unchanged', () => {
    expect(formatThousands('not a number')).toBe('not a number')
  })
})
