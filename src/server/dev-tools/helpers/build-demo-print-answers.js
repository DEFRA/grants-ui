/**
 * Generates mock answers for all answerable components in a form
 * @param {object} definition - Parsed YAML form definition
 * @returns {Record<string, unknown>} Map of component name to demo answer value
 */
import { COMPONENT_TYPES, DISPLAY_ONLY_TYPES } from '~/src/server/common/helpers/print-application-service/constants.js'

export function buildDemoPrintAnswers(definition) {
  /** @type {Record<string, unknown>} */
  const answers = {}

  for (const page of definition.pages || []) {
    for (const component of page.components || []) {
      if (DISPLAY_ONLY_TYPES.has(component.type)) {
        continue
      }

      if (component.name?.startsWith('$$')) {
        continue
      }

      answers[component.name] = getDemoPrintValue(component)
    }
  }

  return answers
}

/**
 * Get a demo value for a component based on its type
 * @param {object} component - Form component definition
 * @returns {*} Demo value appropriate for the component type
 */
const DEMO_VALUES = {
  [COMPONENT_TYPES.YesNoField]: true,
  [COMPONENT_TYPES.TextField]: 'Demo text',
  [COMPONENT_TYPES.NumberField]: 12345,
  [COMPONENT_TYPES.EmailAddressField]: 'demo@example.gov.uk',
  [COMPONENT_TYPES.TelephoneNumberField]: '01234 567890',
  [COMPONENT_TYPES.MultilineTextField]: 'This is demo multiline text for development preview purposes.',
  [COMPONENT_TYPES.DatePartsField]: { day: 15, month: 6, year: 2025 },
  [COMPONENT_TYPES.MonthYearField]: { month: 6, year: 2025 },
  [COMPONENT_TYPES.UkAddressField]: { addressLine1: '10 Downing Street', town: 'London', postcode: 'SW1A 2AA' },
  [COMPONENT_TYPES.RadiosField]: (c) => c?.value ?? 'Demo value',
  [COMPONENT_TYPES.SelectField]: (c) => c?.value ?? 'Demo value',
  [COMPONENT_TYPES.AutocompleteField]: (c) => c?.value ?? 'Demo value',
  [COMPONENT_TYPES.CheckboxesField]: (c) => (c ? [c.value] : ['Demo value'])
}

function getDemoPrintValue(component) {
  const entry = DEMO_VALUES[component.type]

  if (entry === undefined) {
    return 'Demo value'
  }

  if (typeof entry === 'function') {
    const firstItem = (component.items || [])[0]
    return entry(firstItem)
  }

  return entry
}

/**
 * Resolves list UUID references on components to actual items arrays.
 * Form definitions reference lists by UUID in a `list` property, with the
 * actual list data stored in `definition.lists`. This function copies the
 * items onto the component so `formatAnswer`'s `lookupItemLabel` can
 * display proper labels instead of raw values.
 * @param {object} definition - Parsed YAML form definition
 * @returns {object} The same definition, with list items resolved on components
 */
export function enrichDefinitionWithListItems(definition) {
  const listsById = new Map()

  for (const list of definition.lists || []) {
    if (list.id) {
      listsById.set(list.id, list.items || [])
    }
  }

  for (const page of definition.pages || []) {
    for (const component of page.components || []) {
      if (component.list && typeof component.list === 'string' && listsById.has(component.list)) {
        component.items = listsById.get(component.list)
      }
    }
  }

  return definition
}
