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
 * Transforms answer keys in a FormContext object to their corresponding text values
 * @param {object} state - FormContext object
 * @param {object} componentDefMap - Component definitions map
 * @param {object} listDefIdMap - List definitions map by id
 * @returns {object} - FormContext object with answer keys replaced with text values
 */
export function transformAnswerKeysToText(state, componentDefMap, listDefIdMap) {
  const transformedState = {}

  for (const [key, value] of Object.entries(state)) {
    const componentDef = componentDefMap.get(key)

    if (componentDef?.list) {
      const listId = componentDef.list
      const listEntries = listDefIdMap.get(listId).items

      if (Array.isArray(value)) {
        // Handle array values (like checkboxes)
        transformedState[key] = value.map((itemValue) => {
          const entry = listEntries.find((e) => e.value === itemValue)
          return entry ? entry.text : itemValue
        })
      } else {
        // Handle single value (like radios, dropdowns)
        const entry = listEntries.find((e) => e.value === value)
        transformedState[key] = entry ? entry.text : value
      }
    } else {
      // For non-list fields, just copy as-is
      transformedState[key] = value
    }
  }

  return transformedState
}
