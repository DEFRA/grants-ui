import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'

describe('#formatCurrency', () => {
  describe('With defaults', () => {
    test.each([
      ['20000000', '£20,000,000'],
      [1234.5, '£1,234.50'],
      [0, '£0'],
      [-1234, '-£1,234'],
      [1.999, '£2']
    ])('formats %s as %s', (value, expected) => {
      expect(formatCurrency(value)).toBe(expected)
    })
  })

  describe('With Currency attributes', () => {
    test('Currency should be in provided format', () => {
      expect(formatCurrency('5500000', 'en-US', 'USD')).toBe('$5,500,000')
    })
  })

  describe('With no currency symbol', () => {
    test('Should format with commas but no currency sign', () => {
      expect(formatCurrency('1234567', 'en-GB', 'GBP', 0, 'decimal')).toBe('1,234,567')
    })
  })

  describe('With 0 fraction digits', () => {
    test('Should format with no decimals', () => {
      expect(formatCurrency(8900000.5, 'en-GB', 'GBP', 0)).toBe('£8,900,001')
    })
  })
})
