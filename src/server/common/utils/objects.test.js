import { describe, expect, it, test } from 'vitest'
import { assignIfDefined, hasAnyItemWithNonEmptyKey, isObject } from './objects.js'

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

describe('hasAnyItemWithNonEmptyKey', () => {
  it('returns false for an empty or missing collection', () => {
    expect(hasAnyItemWithNonEmptyKey(undefined, 'actionsObj')).toBe(false)
    expect(hasAnyItemWithNonEmptyKey(null, 'actionsObj')).toBe(false)
    expect(hasAnyItemWithNonEmptyKey({}, 'actionsObj')).toBe(false)
    expect(hasAnyItemWithNonEmptyKey([], 'actionsObj')).toBe(false)
  })

  it('returns false when every item has an empty value at the key', () => {
    const collection = { parcel1: { actionsObj: {} }, parcel2: {} }
    expect(hasAnyItemWithNonEmptyKey(collection, 'actionsObj')).toBe(false)
  })

  it('returns true when at least one item (object collection) has a non-empty object value', () => {
    const collection = { parcel1: { actionsObj: {} }, parcel2: { actionsObj: { CLIG3: {} } } }
    expect(hasAnyItemWithNonEmptyKey(collection, 'actionsObj')).toBe(true)
  })

  it('returns true when at least one item (array collection) has a non-empty array value', () => {
    const collection = [{ actionsObj: [] }, { actionsObj: ['CLIG3'] }]
    expect(hasAnyItemWithNonEmptyKey(collection, 'actionsObj')).toBe(true)
  })

  it('ignores non-object items in the collection', () => {
    expect(hasAnyItemWithNonEmptyKey([null, 'x', 42], 'actionsObj')).toBe(false)
  })
})
