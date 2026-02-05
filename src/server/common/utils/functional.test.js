import { describe, expect, it } from 'vitest'
import { logicalAnd, logicalNot } from './functional'

describe('functional components', () => {
  describe('logicalAnd', () => {
    it('should return true when all predicates return true', () => {
      const isEven = (num) => num % 2 === 0
      const isPositive = (num) => num > 0

      const combined = logicalAnd(isEven, isPositive)
      expect(combined(4)).toBe(true)
      expect(combined(5)).toBe(false)
      expect(combined(-4)).toBe(false)
    })

    it('should return false when at least one predicate returns false', () => {
      const isEven = (num) => num % 2 === 0
      const isPositive = (num) => num > 0

      const combined = logicalAnd(isEven, isPositive)
      expect(combined(-4)).toBe(false)
      expect(combined(3)).toBe(false)
    })
  })

  describe('logicalNot', () => {
    it('should invert the result of a predicate returning true', () => {
      const isEven = (num) => num % 2 === 0
      const inverted = logicalNot(isEven)
      expect(inverted(2)).toBe(false)
    })

    it('should invert the result of a predicate returning false', () => {
      const isPositive = (num) => num > 0
      const inverted = logicalNot(isPositive)
      expect(inverted(-1)).toBe(true)
    })

    it('should handle multiple calls with different inputs correctly', () => {
      const lessThanTen = (num) => num < 10
      const inverted = logicalNot(lessThanTen)
      expect(inverted(5)).toBe(false)
      expect(inverted(15)).toBe(true)
    })
  })
})
