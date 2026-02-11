import { describe, expect, it, test } from 'vitest'
import { assignIfDefined, isObject, deepClone } from './objects.js'

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

describe('deepClone', () => {
  it('should clone a plain object', () => {
    const obj = { a: 1, b: 2 }
    const clone = deepClone(obj)
    expect(clone).toEqual(obj)
    expect(clone).not.toBe(obj)
  })

  it('should clone nested objects', () => {
    const obj = { nested: { key: 'value' } }
    const clone = deepClone(obj)
    expect(clone).toEqual(obj)
    expect(clone.nested).not.toBe(obj.nested)
  })

  it('should clone arrays', () => {
    const arr = [1, 2, 3, [4, 5]]
    const clone = deepClone(arr)
    expect(clone).toEqual(arr)
    expect(clone).not.toBe(arr)
    expect(clone[3]).not.toBe(arr[3])
  })

  it('should return null for null value', () => {
    expect(deepClone(null)).toBeNull()
  })

  it('should return the same primitive value', () => {
    expect(deepClone(42)).toBe(42)
    expect(deepClone('string')).toBe('string')
    expect(deepClone(true)).toBe(true)
  })

  it('should handle circular references', () => {
    const obj = {}
    obj.self = obj
    const clone = deepClone(obj)
    expect(clone).toEqual({ self: clone })
  })
})

describe('#assignIfDefined', () => {
  test('Should assign defined properties using the mapped keys', () => {
    const target = {}
    const source = { retryDelay: 'retryDelayOnFailover', maxRetries: 3 }

    assignIfDefined(target, source, {
      retryDelay: 'retryDelayOnFailover',
      maxRetries: 'maxRetriesPerRequest'
    })

    expect(target).toEqual({
      retryDelayOnFailover: 'retryDelayOnFailover',
      maxRetriesPerRequest: 3
    })
  })

  test('Should preserve existing target properties', () => {
    const target = { connectTimeout: 5000 }
    const source = { maxRetries: 3 }

    assignIfDefined(target, source, {
      maxRetries: 'maxRetriesPerRequest'
    })

    expect(target).toEqual({
      connectTimeout: 5000,
      maxRetriesPerRequest: 3
    })
  })

  test.each([
    {
      scenario: 'value is explicitly undefined',
      source: { connectTimeout: 5000, commandTimeout: undefined },
      mappings: { connectTimeout: 'connectTimeout', commandTimeout: 'commandTimeout' }
    },
    {
      scenario: 'key is not present in source',
      source: { connectTimeout: 5000 },
      mappings: { connectTimeout: 'connectTimeout', enableOfflineQueue: 'enableOfflineQueue' }
    }
  ])('Should not assign when $scenario', ({ source, mappings }) => {
    const target = {}

    assignIfDefined(target, source, mappings)

    expect(target).toEqual({ connectTimeout: 5000 })
  })

  describe('Prototype pollution protection', () => {
    test.each(['__proto__', 'constructor', 'prototype'])('Should not assign %s key', (dangerousKey) => {
      const target = {}
      const source = { malicious: { polluted: true } }

      assignIfDefined(target, source, {
        malicious: dangerousKey
      })

      expect(Object.hasOwn(target, dangerousKey)).toBe(false)
    })
  })
})
