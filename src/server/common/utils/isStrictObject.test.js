import { isStrictObject } from './isStrictObject.js'

describe('isStrictObject', () => {
  it('returns true for plain objects', () => {
    expect(isStrictObject({ key: 'value' })).toBe(true)
  })

  it('returns false for arrays', () => {
    expect(isStrictObject([])).toBe(false)
    expect(isStrictObject([1, 2, 3])).toBe(false)
  })

  it('returns false for null', () => {
    expect(isStrictObject(null)).toBe(false)
  })

  it('returns false for primitive types', () => {
    expect(isStrictObject(42)).toBe(false)
    expect(isStrictObject('string')).toBe(false)
    expect(isStrictObject(true)).toBe(false)
    expect(isStrictObject(undefined)).toBe(false)
    expect(isStrictObject(Symbol('test'))).toBe(false)
  })

  it('returns false for functions', () => {
    expect(isStrictObject(() => {})).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isStrictObject(undefined)).toBe(false)
  })

  it('handles the optional checkIfEmpty flag', () => {
    expect(isStrictObject({}, false)).toBe(true)
    expect(isStrictObject({}, true)).toBe(false)
  })

  it('returns false for built-in objects', () => {
    expect(isStrictObject(new Date())).toBe(false)
    expect(isStrictObject(/test/)).toBe(false)
    expect(isStrictObject(new Map())).toBe(false)
    expect(isStrictObject(new Set())).toBe(false)
    expect(isStrictObject(new WeakMap())).toBe(false)
    expect(isStrictObject(new WeakSet())).toBe(false)
  })

  it('returns true for class instances', () => {
    class TestClass {}
    expect(isStrictObject(new TestClass())).toBe(true)
  })

  it('returns true for empty objects when checkIfEmpty is false', () => {
    expect(isStrictObject({})).toBe(true)
    expect(isStrictObject({}, false)).toBe(true)
  })

  it('returns false for empty objects when checkIfEmpty is true', () => {
    expect(isStrictObject({}, true)).toBe(false)
  })

  it('returns true for non-empty objects when checkIfEmpty is true', () => {
    expect(isStrictObject({ a: 1 }, true)).toBe(true)
    expect(isStrictObject({ '': '' }, true)).toBe(true)
    expect(isStrictObject({ 0: 'zero' }, true)).toBe(true)
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
    expect(isStrictObject(complexObj)).toBe(true)
    expect(isStrictObject(complexObj, true)).toBe(true)
  })

  it('defaults checkIfEmpty to false', () => {
    expect(isStrictObject({})).toBe(true)
    expect(isStrictObject({ a: 1 })).toBe(true)
  })
})
