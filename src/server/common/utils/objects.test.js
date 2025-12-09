import { describe, expect, it } from 'vitest'
import { isObject } from './objects.js'

describe('isObject', () => {
  it('should return true for plain objects', () => {
    expect(isObject({})).toBe(true)
    expect(isObject({ key: 'value' })).toBe(true)
  })

  it('should return false for arrays', () => {
    expect(isObject([])).toBe(false)
    expect(isObject([1, 2, 3])).toBe(false)
  })

  it('should return false for functions', () => {
    expect(isObject(() => {})).toBe(false)
    expect(isObject(function test() {})).toBe(false)
  })

  it('returns false for null', () => {
    expect(isObject(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isObject(undefined)).toBe(false)
  })

  it('should return false for objects with a custom prototype', () => {
    const customProto = Object.create({ custom: true })
    expect(isObject(customProto)).toBe(false)
  })

  it('should return false for class instances', () => {
    class Test {}

    expect(isObject(new Test())).toBe(false)
  })

  it('should return false for non-object types', () => {
    expect(isObject(42)).toBe(false)
    expect(isObject('string')).toBe(false)
    expect(isObject(true)).toBe(false)
    expect(isObject(undefined)).toBe(false)
    expect(isObject(null)).toBe(false)
  })

  it('returns false for primitive types', () => {
    expect(isObject(42)).toBe(false)
    expect(isObject('string')).toBe(false)
    expect(isObject(true)).toBe(false)
    expect(isObject(undefined)).toBe(false)
    expect(isObject(Symbol('test'))).toBe(false)
  })

  it('returns false for built-in objects', () => {
    expect(isObject(new Date())).toBe(false)
    expect(isObject(/test/)).toBe(false)
    expect(isObject(new Map())).toBe(false)
    expect(isObject(new Set())).toBe(false)
    expect(isObject(new WeakMap())).toBe(false)
    expect(isObject(new WeakSet())).toBe(false)
  })

  it('handles complex object structures', () => {
    const complexObj = {
      nested: {
        deep: {
          value: 'test'
        }
      },
      array: [1, 2, 3],
      func: () => {
        return 'test'
      },
      date: new Date()
    }
    expect(isObject(complexObj)).toBe(true)
  })
})
