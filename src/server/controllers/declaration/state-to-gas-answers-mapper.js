/**
 * @typedef {object} ActionArea
 * @property {string} unit - Area units (ha, m2, etc)
 * @property {number} quantity - Area value
 */

/**
 * @typedef {object} ActionApplication
 * @property {string} parcelId - The parcel identifier
 * @property {string} sheetId - The sheet identifier
 * @property {string} code - Action code
 * @property {ActionArea} appliedFor - Area applied for
 */

/**
 * @typedef {object} GASAnswers
 * @property {string} [scheme] - Scheme
 * @property {number} [year] - Scheme year
 * @property {boolean} [hasCheckedLandIsUpToDate] - Land details are up to date
 * @property {ActionApplication[]} [actionApplications] - Action applications information
 */

/**
 * Transforms a state object by mapping answer keys to their corresponding text values
 * using component and list definitions. For fields with list definitions, it converts
 * the values to an object containing both the value and its associated text. For
 * checkbox arrays, it maps each value in the array to its corresponding value-text pair.
 * Non-list fields are copied as-is.
 * @param {object} state - The state object containing key-value pairs to transform.
 * @param {Map} componentDefMap - A map where keys are state keys and values are component
 *                                definitions which may contain list information.
 * @param {Map} listDefMap - A map where keys are list identifiers and values are list
 *                           definitions containing items with value and text properties.
 * @returns {object} A new state object with transformed answer keys, where applicable,
 *                   to include both value and text information.
 */

export function transformAnswerKeysToText(state, componentDefMap, listDefMap) {
  const transformedState = {}

  for (const [key, value] of Object.entries(state)) {
    const componentDef = componentDefMap.get(key)

    if (componentDef?.list) {
      const listId = componentDef.list
      const listEntries = listDefMap.get(listId)

      if (Array.isArray(value)) {
        // For checkbox arrays, map each to { value, text }
        transformedState[key] = value.map((itemValue) => {
          const entry = listEntries.items.find((e) => e.value === itemValue)
          return {
            value: itemValue,
            text: entry ? entry.text : itemValue
          }
        })
      } else {
        // For single selection, wrap into { value, text }
        const entry = listEntries.items.find((e) => e.value === value)
        transformedState[key] = {
          value,
          text: entry ? entry.text : value
        }
      }
    } else {
      // For non-list fields, just copy as-is
      transformedState[key] = value
    }
  }

  return transformedState
}
