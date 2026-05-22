import { describe, it, expect } from 'vitest'
import { buildInvalidatedState, hasChanged } from './state-invalidation.js'

describe('hasChanged', () => {
  describe('scalar values', () => {
    it('returns false when values are the same', () => {
      expect(hasChanged('foo', 'foo')).toBe(false)
      expect(hasChanged(42, 42)).toBe(false)
      expect(hasChanged(null, null)).toBe(false)
      expect(hasChanged(undefined, undefined)).toBe(false)
    })

    it('returns true when values differ', () => {
      expect(hasChanged('foo', 'bar')).toBe(true)
      expect(hasChanged(1, 2)).toBe(true)
      expect(hasChanged(null, undefined)).toBe(true)
    })
  })

  describe('array values', () => {
    it('returns false when arrays contain the same elements in the same order', () => {
      expect(hasChanged(['a', 'b'], ['a', 'b'])).toBe(false)
    })

    it('returns false when arrays contain the same elements in different order', () => {
      expect(hasChanged(['b', 'a'], ['a', 'b'])).toBe(false)
    })

    it('returns true when arrays differ in length', () => {
      expect(hasChanged(['a'], ['a', 'b'])).toBe(true)
    })

    it('returns true when arrays contain different elements', () => {
      expect(hasChanged(['a', 'b'], ['a', 'c'])).toBe(true)
    })

    it('returns true when one array is empty and the other is not', () => {
      expect(hasChanged([], ['a'])).toBe(true)
    })

    it('returns false for two empty arrays', () => {
      expect(hasChanged([], [])).toBe(false)
    })
  })

  describe('mixed types', () => {
    it('returns true when comparing array to non-array', () => {
      expect(hasChanged(['a'], 'a')).toBe(true)
      expect(hasChanged('a', ['a'])).toBe(true)
    })
  })
})

describe('buildInvalidatedState', () => {
  it('returns empty object when invalidates list is empty', () => {
    expect(buildInvalidatedState('old', 'new', [])).toEqual({})
  })

  it('returns empty object when value has not changed', () => {
    expect(buildInvalidatedState('same', 'same', ['fieldA', 'fieldB'])).toEqual({})
  })

  it('returns empty object when array value has not changed (order-insensitive)', () => {
    expect(buildInvalidatedState(['b', 'a'], ['a', 'b'], ['fieldA'])).toEqual({})
  })

  it('returns keys mapped to undefined when scalar value changes', () => {
    const result = buildInvalidatedState('old', 'new', ['fieldA', 'fieldB'])
    expect(result).toEqual({ fieldA: undefined, fieldB: undefined })
  })

  it('returns keys mapped to undefined when array value changes', () => {
    const result = buildInvalidatedState(['parcel-1'], ['parcel-1', 'parcel-2'], ['hectaresOver', 'hectaresUnder'])
    expect(result).toEqual({ hectaresOver: undefined, hectaresUnder: undefined })
  })

  it('returns keys mapped to undefined when previous value is undefined', () => {
    const result = buildInvalidatedState(undefined, 'new', ['fieldA'])
    expect(result).toEqual({ fieldA: undefined })
  })
})
