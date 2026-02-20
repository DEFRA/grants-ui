/**
 * Generates mock answers for all answerable components in a form
 * @param {object} definition - Parsed YAML form definition
 * @returns {Record<string, unknown>} Map of component name to demo answer value
 */
import { COMPONENT_TYPES, DISPLAY_ONLY_TYPES } from '~/src/server/common/helpers/print-application-service/constants.js'

const DEMO_DEFAULT = 'Demo value'

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
  [COMPONENT_TYPES.RadiosField]: (c) => c?.value ?? DEMO_DEFAULT,
  [COMPONENT_TYPES.SelectField]: (c) => c?.value ?? DEMO_DEFAULT,
  [COMPONENT_TYPES.AutocompleteField]: (c) => c?.value ?? DEMO_DEFAULT,
  [COMPONENT_TYPES.CheckboxesField]: (c) => (c ? [c.value] : [DEMO_DEFAULT])
}

export function buildDemoPrintAnswers(definition) {
  /** @type {Record<string, unknown>} */
  const answers = {}

  for (const page of definition.pages || []) {
    for (const component of page.components || []) {
      addComponentAnswer(answers, component)
    }
  }

  return answers
}

/**
 * Add a demo answer for a single component if it is answerable
 * @param {Record<string, unknown>} answers - Answers map to populate
 * @param {object} component - Form component definition
 */
function addComponentAnswer(answers, component) {
  if (DISPLAY_ONLY_TYPES.has(component.type) || component.name?.startsWith('$$')) {
    return
  }

  answers[component.name] = getDemoPrintValue(component)
}

/**
 * Get a demo value for a component based on its type
 * @param {object} component - Form component definition
 * @returns {*} Demo value appropriate for the component type
 */
function getDemoPrintValue(component) {
  if (!(component.type in DEMO_VALUES)) {
    return DEMO_DEFAULT
  }

  const entry = DEMO_VALUES[component.type]

  if (typeof entry === 'function') {
    const firstItem = (component.items || [])[0]
    return entry(firstItem)
  }

  return entry
}
