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

    it('should format 11-digit mobile number with random spacing', () => {
      const result = formatPhone('0712 3456 789')
      expect(result).toBe('07123 456789')
    })

    it('should format 11-digit mobile number with all spaces', () => {
      const result = formatPhone('0 7 1 2 3 4 5 6 7 8 9')
      expect(result).toBe('07123 456789')
    })

    it('should format landline number', () => {
      const result = formatPhone('01234567890')
      expect(result).toBe('01234 567890')
    })

    it('should format another mobile prefix', () => {
      const result = formatPhone('07987654321')
      expect(result).toBe('07987 654321')
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

    it('should format numbers not starting with 0 if they match the pattern', () => {
      const result = formatPhone('17123456789')
      expect(result).toBe('17123 456789')
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
    it('should handle leading spaces', () => {
      const result = formatPhone('  07123456789')
      expect(result).toBe('07123 456789')
    })

    it('should handle trailing spaces', () => {
      const result = formatPhone('07123456789  ')
      expect(result).toBe('07123 456789')
    })

    it('should handle multiple consecutive spaces', () => {
      const result = formatPhone('07123   456789')
      expect(result).toBe('07123 456789')
    })

    it('should handle tabs and other whitespace', () => {
      const result = formatPhone('07123\t456\n789')
      expect(result).toBe('07123 456789')
    })
  })

  describe('real-world examples', () => {
    it('should format typical mobile number as entered by user', () => {
      const result = formatPhone('07712 345678')
      expect(result).toBe('07712 345678')
    })

    it('should format London landline', () => {
      const result = formatPhone('02071234567')
      expect(result).toBe('02071 234567')
    })

    it('should format Manchester landline', () => {
      const result = formatPhone('01614567890')
      expect(result).toBe('01614 567890')
    })

    it('should format three mobile network number', () => {
      const result = formatPhone('07711234567')
      expect(result).toBe('07711 234567')
    })

    it('should format EE mobile number', () => {
      const result = formatPhone('07812345678')
      expect(result).toBe('07812 345678')
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
    it('should handle numeric input by converting to string', () => {
      const result = formatPhone(String(7123456789))
      expect(result).toBe('7123456789')
    })

    it('should throw error for numeric input without conversion', () => {
      expect(() => formatPhone(7123456789)).toThrow()
    })

    it('should handle string representation of number', () => {
      const result = formatPhone('7123456789')
      expect(result).toBe('7123456789')
    })
  })
})
