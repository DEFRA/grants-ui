/**
 * Field naming and payload normalisation for the select-actions page, where every
 * action shares one checkbox field name (rather than a field per action). The browser
 * submits repeated `landAction=CODE` pairs, which Node's querystring parser turns into
 * a string when exactly one box is checked, or an array when two or more are checked.
 * Everywhere this payload is read must normalise through `getSelectedActionCodes`
 * rather than assume either shape.
 */

export const SELECTED_ACTIONS_FIELD_NAME = 'landAction'

/**
 * Normalises the submitted action selection into an array of codes, handling the
 * single-value-is-a-string vs multiple-values-is-an-array quirk of form parsing.
 * @param {object} payload - Form payload
 * @returns {string[]} - Selected action codes
 */
export function getSelectedActionCodes(payload) {
  const value = payload?.[SELECTED_ACTIONS_FIELD_NAME]
  if (value == null || value === '') {
    return []
  }
  return Array.isArray(value) ? value : [value]
}
