/**
 * Normalises a state collection (array or object keyed by id) into an array of
 * its items so callers can iterate uniformly.
 * @param {unknown} collection - The collection value read from form state.
 * @returns {unknown[]} The collection's items, or an empty array.
 */
function resolveCollectionItems(collection) {
  if (Array.isArray(collection)) {
    return collection
  }

  if (collection && typeof collection === 'object') {
    return Object.values(collection)
  }

  return []
}

/**
 * Determines whether a state collection contains at least one item that has a
 * non-empty value at the given key. The collection may be stored either as an
 * array of items or as an object keyed by id; in both cases each item is
 * inspected. A value counts as "non-empty" when it is a non-empty array or an
 * object with at least one own key.
 * @param {unknown} collection - The collection value read from form state.
 * @param {string} key - The property each item must populate to count.
 * @returns {boolean} `true` if any item has a non-empty value at `key`.
 */
export function hasAnyItemWithNonEmptyKey(collection, key) {
  const items = resolveCollectionItems(collection)

  return items.some((item) => {
    if (!item || typeof item !== 'object') {
      return false
    }

    const value = item[key]

    if (Array.isArray(value)) {
      return value.length > 0
    }

    return Boolean(value) && typeof value === 'object' && Object.keys(/** @type {object} */ (value)).length > 0
  })
}
