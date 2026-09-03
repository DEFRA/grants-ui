/**
 * Normalises a collection (array, or object keyed by id) into an array of items.
 * @param {unknown} collection
 * @returns {unknown[]}
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
 * Whether any item in the collection has a non-empty array/object value at `key`.
 * @param {unknown} collection
 * @param {string} key
 * @returns {boolean}
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
