import { describe, it, expect } from 'vitest'
import { formatPrice } from './payment.js'

describe('formatPrice', () => {
  it('should format pence as GBP currency string', () => {
    expect(formatPrice(439368)).toBe('£4,393.68')
  })

  it('should format zero', () => {
    expect(formatPrice(0)).toBe('£0.00')
  })
})
