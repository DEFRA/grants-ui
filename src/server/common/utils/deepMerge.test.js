import { describe, expect, it } from 'vitest'
import { deepMerge } from './deepMerge'

describe('deepMerge', () => {
  describe('objects with no nesting', () => {
    it('should merge two flat objects', () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { b: 3, c: 4 }
      const result = deepMerge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: 3, c: 4 })
    })

    it('should merge nested objects', () => {
      const obj1 = { a: 1, b: { c: 2 } }
      const obj2 = { b: { d: 3 } }
      const result = deepMerge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: { c: 2, d: 3 } })
    })

    it('should override primitive values with object values', () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { b: { c: 3 } }
      const result = deepMerge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: { c: 3 } })
    })

    it('should override object values with primitive values', () => {
      const obj1 = { a: 1, b: { c: 2 } }
      const obj2 = { b: 3 }
      const result = deepMerge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: 3 })
    })

    it('should handle empty source object', () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = {}
      const result = deepMerge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('should handle empty target object', () => {
      const obj1 = {}
      const obj2 = { a: 1, b: 2 }
      const result = deepMerge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('should return a new object and not mutate target or source', () => {
      const obj1 = { a: 1, b: { c: 2 } }
      const obj2 = { b: { d: 3 } }
      const result = deepMerge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: { c: 2, d: 3 } })
      expect(obj1).toEqual({ a: 1, b: { c: 2 } })
      expect(obj2).toEqual({ b: { d: 3 } })
    })
  })

  describe('objects with nested structures', () => {
    it('should deeply merge nested objects', () => {
      const obj1 = { a: 1, b: { c: { d: 2 } } }
      const obj2 = { b: { c: { e: 3 }, f: 4 }, g: 5 }
      const result = deepMerge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: { c: { d: 2, e: 3 }, f: 4 }, g: 5 })
    })

    it('should not mutate nested primitives', () => {
      const obj1 = { a: 1, b: { c: 2 } }
      const obj2 = { b: { c: 3 } }
      const result = deepMerge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: { c: 3 } })
      expect(obj1).toEqual({ a: 1, b: { c: 2 } })
      expect(obj2).toEqual({ b: { c: 3 } })
    })

    it('should not mutate nested objects', () => {
      const obj1 = { a: 1, b: { c: { d: 2 } } }
      const obj2 = { b: { c: { e: 3 } } }
      const result = deepMerge(obj1, obj2)
      expect(result).toEqual({ a: 1, b: { c: { d: 2, e: 3 } } })
      expect(obj1).toEqual({ a: 1, b: { c: { d: 2 } } })
      expect(obj2).toEqual({ b: { c: { e: 3 } } })
    })

    it('should create independent copies of nested objects from source', () => {
      const obj1 = { a: 1 }
      const obj2 = { b: { c: 2 } }
      const result = deepMerge(obj1, obj2)
      result.b.c = 3
      expect(result).toHaveProperty('b.c', 3)
      expect(obj2).not.toHaveProperty('b.c', 3)
    })

    it('should create independent copies of nested arrays from source', () => {
      const obj1 = { a: 1 }
      const obj2 = { b: { c: [1, 2] } }
      const result = deepMerge(obj1, obj2)
      result.b.c.push(3)
      expect(result).toHaveProperty('b.c', [1, 2, 3])
      expect(obj2).toHaveProperty('b.c', [1, 2])
    })
  })
})
