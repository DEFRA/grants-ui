import { describe, expect, it } from 'vitest'
import { deepClone } from './deepClone'

describe('deepClone', () => {
  it('returns primitives as-is', () => {
    expect(deepClone(42)).toBe(42)
    expect(deepClone('string')).toBe('string')
    expect(deepClone(true)).toBe(true)
    expect(deepClone(null)).toBe(null)
    expect(deepClone(undefined)).toBe(undefined)
    expect(deepClone(Symbol.for('symbol'))).toBe(Symbol.for('symbol'))
  })

  it('deeply clones arrays', () => {
    const arr = [1, 2, { a: 3 }]
    const cloned = deepClone(arr)
    expect(cloned).toEqual(arr)
    expect(cloned).not.toBe(arr)
    expect(cloned[2]).not.toBe(arr[2])
  })

  it('deeply clones plain objects', () => {
    const obj = { a: 1, b: { c: 2 } }
    const cloned = deepClone(obj)
    expect(cloned).toEqual(obj)
    expect(cloned).not.toBe(obj)
    expect(cloned.b).not.toBe(obj.b)
  })

  it('handles circular references', () => {
    const obj = { a: 1 }
    obj.self = obj
    const cloned = deepClone(obj)
    expect(cloned).toEqual(obj)
    expect(cloned).not.toBe(obj)
    expect(cloned.self).toBe(cloned)
  })

  it('deeply clones dates', () => {
    const date = new Date()
    const cloned = deepClone(date)
    expect(cloned).toEqual(date)
    expect(cloned).not.toBe(date)
  })

  it('deeply clones maps', () => {
    const map = new Map([[1, { a: 2 }]])
    const cloned = deepClone(map)
    expect(cloned).toEqual(map)
    expect(cloned).not.toBe(map)
    expect(cloned.get(1)).not.toBe(map.get(1))
  })

  it('deeply clones sets', () => {
    const set = new Set([{ a: 1 }])
    const cloned = deepClone(set)
    expect(cloned).toEqual(set)
    expect(cloned).not.toBe(set)
    const [originalItem] = set
    const [clonedItem] = cloned
    expect(clonedItem).not.toBe(originalItem)
  })

  it('returns class instances by reference', () => {
    class MyClass {
      constructor(value) {
        this.value = value
      }
    }

    const instance = new MyClass(42)
    const cloned = deepClone(instance)
    expect(cloned).toBe(instance)
  })

  it('returns functions by reference', () => {
    const fn = () => undefined
    const cloned = deepClone(fn)
    expect(cloned).toBe(fn)
  })

  it('returns DOM nodes by reference', () => {
    const element = document.createElement('div')
    const cloned = deepClone(element)
    expect(cloned).toBe(element)
  })
})
