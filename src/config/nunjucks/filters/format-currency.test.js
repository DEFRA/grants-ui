import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'

describe('#formatCurrency', () => {
  describe('With defaults', () => {
    test('Currency should be in expected format', () => {
      expect(formatCurrency('20000000')).toBe('£20,000,000.00')
    })
  })

  describe('With Currency attributes', () => {
    test('Currency should be in provided format', () => {
      expect(formatCurrency('5500000', 'en-US', 'USD')).toBe('$5,500,000.00')
    })
  })

  describe('With no currency symbol', () => {
    test('Should format with commas but no currency sign', () => {
      expect(formatCurrency('1234567', 'en-GB', 'GBP', 0, 'decimal')).toBe(
        '1,234,567'
      )
    })
  })

  describe('With 0 fraction digits', () => {
    test('Should format with no decimals', () => {
      expect(formatCurrency('8900000', 'en-GB', 'GBP', 0)).toBe('£8,900,000')
    })
  })
})
