import { describe, it, expect } from 'vitest'
import { resolvePath } from './path-utils.js'

describe('resolvePath', () => {
  it('resolves simple dot-notation paths', () => {
    const obj = { foo: { bar: 'value' } }
    expect(resolvePath(obj, 'foo.bar')).toBe('value')
  })

  it('resolves single-level paths', () => {
    const obj = { foo: 'bar' }
    expect(resolvePath(obj, 'foo')).toBe('bar')
  })

  it('resolves deeply nested paths', () => {
    const obj = { a: { b: { c: { d: 'deep' } } } }
    expect(resolvePath(obj, 'a.b.c.d')).toBe('deep')
  })

  it('resolves array index notation', () => {
    const obj = { items: [{ name: 'first' }, { name: 'second' }] }
    expect(resolvePath(obj, 'items[0].name')).toBe('first')
    expect(resolvePath(obj, 'items[1].name')).toBe('second')
  })

  it('resolves array index at root level', () => {
    const obj = { items: ['a', 'b', 'c'] }
    expect(resolvePath(obj, 'items[0]')).toBe('a')
    expect(resolvePath(obj, 'items[2]')).toBe('c')
  })

  it('returns undefined for missing paths', () => {
    const obj = { foo: { bar: 'value' } }
    expect(resolvePath(obj, 'foo.missing')).toBeUndefined()
    expect(resolvePath(obj, 'missing.path')).toBeUndefined()
  })

  it('returns undefined for out-of-bounds array indices', () => {
    const obj = { items: ['a', 'b'] }
    expect(resolvePath(obj, 'items[5]')).toBeUndefined()
  })

  it('returns undefined for null/undefined objects', () => {
    expect(resolvePath(null, 'foo')).toBeUndefined()
    expect(resolvePath(undefined, 'foo')).toBeUndefined()
  })

  it('returns undefined for empty path', () => {
    expect(resolvePath({ foo: 'bar' }, '')).toBeUndefined()
  })

  it('returns undefined for null/undefined path', () => {
    expect(resolvePath({ foo: 'bar' }, null)).toBeUndefined()
    expect(resolvePath({ foo: 'bar' }, undefined)).toBeUndefined()
  })

  it('handles null values in path correctly', () => {
    const obj = { foo: { bar: null } }
    expect(resolvePath(obj, 'foo.bar')).toBeNull()
    expect(resolvePath(obj, 'foo.bar.baz')).toBeUndefined()
  })

  it('returns non-object values correctly', () => {
    const obj = {
      string: 'hello',
      number: 42,
      boolean: true,
      array: [1, 2, 3]
    }
    expect(resolvePath(obj, 'string')).toBe('hello')
    expect(resolvePath(obj, 'number')).toBe(42)
    expect(resolvePath(obj, 'boolean')).toBe(true)
    expect(resolvePath(obj, 'array')).toEqual([1, 2, 3])
  })
})
