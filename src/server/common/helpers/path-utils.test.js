import { describe, it, expect } from 'vitest'
import { normaliseResponseMappingPath, resolvePath } from './path-utils.js'

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

  it.each([
    ['missing property', { foo: { bar: 'value' } }, 'foo.missing'],
    ['missing nested path', { foo: { bar: 'value' } }, 'missing.path'],
    ['out-of-bounds array index', { items: ['a', 'b'] }, 'items[5]'],
    ['null object', null, 'foo'],
    ['undefined object', undefined, 'foo'],
    ['empty path', { foo: 'bar' }, ''],
    ['null path', { foo: 'bar' }, null],
    ['undefined path', { foo: 'bar' }, undefined]
  ])('returns undefined for %s', (_, obj, path) => {
    expect(resolvePath(obj, path)).toBeUndefined()
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

  describe('Prototype pollution protection', () => {
    it.each(['__proto__', 'constructor', 'prototype'])('should return undefined for %s in path', (dangerousKey) => {
      const obj = { [dangerousKey]: 'compromised' }
      expect(resolvePath(obj, dangerousKey)).toBeUndefined()
    })

    it.each(['__proto__', 'constructor', 'prototype'])(
      'should return undefined for %s in nested path',
      (dangerousKey) => {
        const obj = { foo: { [dangerousKey]: 'compromised' } }
        expect(resolvePath(obj, `foo.${dangerousKey}`)).toBeUndefined()
      }
    )

    it.each(['__proto__', 'constructor', 'prototype'])(
      'should return undefined for %s in array notation',
      (dangerousKey) => {
        const obj = { [dangerousKey]: ['compromised'] }
        expect(resolvePath(obj, `${dangerousKey}[0]`)).toBeUndefined()
      }
    )
  })
})

describe('normaliseResponseMappingPath', () => {
  it.each([
    ['strips leading data. prefix', 'data.business.info', 'business.info'],
    [
      'removes array index notation',
      'data.business.countyParishHoldings[0].cphNumber',
      'business.countyParishHoldings.cphNumber'
    ],
    ['leaves paths without data. prefix unchanged', 'business.info', 'business.info'],
    ['removes multiple array indices', 'data.items[0].sub[1].value', 'items.sub.value']
  ])('%s', (_, input, expected) => {
    expect(normaliseResponseMappingPath(input)).toBe(expected)
  })
})
