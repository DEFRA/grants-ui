import { describe, it, expect } from 'vitest'
import { hasAnyItemWithNonEmptyKey } from './state-collection.js'

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
