import { describe, expect, it } from 'vitest'
import { formatPrice, formatSavedPayment } from './payment.js'

describe('formatPrice', () => {
  it('should format pence as GBP currency string', () => {
    expect(formatPrice(439368)).toBe('£4,393.68')
  })

  it('should format zero', () => {
    expect(formatPrice(0)).toBe('£0')
  })

  it('should return £0 for null', () => {
    expect(formatPrice(null)).toBe('£0')
  })

  it('should return £0 for undefined', () => {
    expect(formatPrice(undefined)).toBe('£0')
  })

  it('should return £0 for a non-numeric string', () => {
    expect(formatPrice('abc')).toBe('£0')
  })
})

describe('formatSavedPayment', () => {
  it.each([
    ['£1,234.50', '£1,234.50'],
    ['-£1,234.00', '-£1,234'],
    ['£1000.00', '£1,000'],
    ['£1000', '£1,000'],
    ['£0.00', '£0'],
    ['-£1234.05', '-£1,234.05'],
    ['£1,234,567.00', '£1,234,567']
  ])('formats %s as %s', (savedPayment, expected) => {
    expect(formatSavedPayment(savedPayment)).toBe(expected)
  })

  it.each(['1000.00', '£12,34.00'])('preserves unrecognised saved payment %s', (savedPayment) => {
    expect(formatSavedPayment(savedPayment)).toBe(savedPayment)
  })
})
