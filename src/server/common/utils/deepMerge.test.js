import { describe, expect, it } from 'vitest'
import { deepMerge } from './deepMerge'

describe('deepMerge', () => {
  describe('objects with no nesting', () => {
    it('should merge two flat objects', () => {
      const target = { a: 1, b: 2 }
      const source = { b: 3, c: 4 }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: 3, c: 4 })
    })

    it('should merge nested objects', () => {
      const target = { a: 1, b: { c: 2 } }
      const source = { b: { d: 3 } }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: { c: 2, d: 3 } })
    })

    it('should override primitive values with object values', () => {
      const target = { a: 1, b: 2 }
      const source = { b: { c: 3 } }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: { c: 3 } })
    })

    it('should override object values with primitive values', () => {
      const target = { a: 1, b: { c: 2 } }
      const source = { b: 3 }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: 3 })
    })

    it('should handle empty source object', () => {
      const target = { a: 1, b: 2 }
      const source = {}
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('should handle empty target object', () => {
      const target = {}
      const source = { a: 1, b: 2 }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('should return a new object and not mutate target or source', () => {
      const target = { a: 1, b: { c: 2 } }
      const source = { b: { d: 3 } }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: { c: 2, d: 3 } })
      expect(target).toEqual({ a: 1, b: { c: 2 } })
      expect(source).toEqual({ b: { d: 3 } })
    })
  })

  describe('objects with nested structures', () => {
    it('should deeply merge nested objects', () => {
      const target = { a: 1, b: { c: { d: 2 } } }
      const source = { b: { c: { e: 3 }, f: 4 }, g: 5 }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: { c: { d: 2, e: 3 }, f: 4 }, g: 5 })
    })

    it('should not mutate nested primitives', () => {
      const target = { a: 1, b: { c: 2 } }
      const source = { b: { c: 3 } }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: { c: 3 } })
      expect(target).toEqual({ a: 1, b: { c: 2 } })
      expect(source).toEqual({ b: { c: 3 } })
    })

    it('should not mutate nested objects', () => {
      const target = { a: 1, b: { c: { d: 2 } } }
      const source = { b: { c: { e: 3 } } }
      const result = deepMerge(target, source)
      expect(result).toEqual({ a: 1, b: { c: { d: 2, e: 3 } } })
      expect(target).toEqual({ a: 1, b: { c: { d: 2 } } })
      expect(source).toEqual({ b: { c: { e: 3 } } })
    })

    it('should create independent copies of nested objects from source', () => {
      const target = { a: 1 }
      const source = { b: { c: 2 } }
      const result = deepMerge(target, source)
      result.b.c = 3
      expect(result).toHaveProperty('b.c', 3)
      expect(source).toHaveProperty('b.c', 2)
    })

    it('should create independent copies of nested arrays from source', () => {
      const target = { a: 1 }
      const source = { b: { c: [1, 2] } }
      const result = deepMerge(target, source)
      result.b.c.push(3)
      expect(result).toHaveProperty('b.c', [1, 2, 3])
      expect(source).toHaveProperty('b.c', [1, 2])
    })
  })
})
