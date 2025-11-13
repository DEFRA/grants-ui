import { formatPhone } from './format-phone.js'

describe('formatPhone', () => {
  describe('valid UK phone numbers', () => {
    it('should format 11-digit mobile number without spaces', () => {
      const result = formatPhone('07123456789')
      expect(result).toBe('07123 456789')
    })

    it('should format 11-digit mobile number with existing spaces', () => {
      const result = formatPhone('07123 456 789')
      expect(result).toBe('07123 456789')
    })

    it('should format landline number', () => {
      const result = formatPhone('01234567890')
      expect(result).toBe('01234 567890')
    })
  })

  describe('invalid or edge case phone numbers', () => {
    it('should return unchanged for numbers with wrong length (too short)', () => {
      const result = formatPhone('0712345678')
      expect(result).toBe('0712345678')
    })

    it('should return unchanged for numbers with wrong length (too long)', () => {
      const result = formatPhone('071234567890')
      expect(result).toBe('071234567890')
    })

    it('should return unchanged for international format', () => {
      const result = formatPhone('+447123456789')
      expect(result).toBe('+447123456789')
    })

    it('should handle empty string', () => {
      const result = formatPhone('')
      expect(result).toBe('')
    })

    it('should handle numbers with non-digit characters', () => {
      const result = formatPhone('0712-345-6789')
      expect(result).toBe('0712-345-6789')
    })

    it('should handle numbers with letters', () => {
      const result = formatPhone('0712abc6789')
      expect(result).toBe('0712abc6789')
    })
  })

  describe('edge cases with spaces', () => {
    it('should handle tabs and other whitespace', () => {
      const result = formatPhone('07123\t456\n789')
      expect(result).toBe('07123 456789')
    })
  })

  describe('null and undefined handling', () => {
    it('should handle null input gracefully', () => {
      expect(() => formatPhone(null)).toThrow()
    })

    it('should handle undefined input gracefully', () => {
      expect(() => formatPhone(undefined)).toThrow()
    })
  })

  describe('type coercion', () => {
    it('should throw error for numeric input without conversion', () => {
      expect(() => formatPhone(7123456789)).toThrow()
    })
  })
})
