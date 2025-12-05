import { describe, expect, it } from 'vitest'
import { deepMerge } from './deepMerge'

describe('deepMerge', () => {
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
