import { COMPONENT_TYPES, MONTH_NAMES } from '~/src/server/common/helpers/print-application-service/constants.js'

/**
 * Looks up the display text for a value from a component's items list
 * @param {object} component
 * @param {string} value
 * @returns {string}
 */
function lookupItemLabel(component, value) {
  const items = component.items || component.list?.items || []
  const match = items.find((item) => item.value === value)
  return match?.text ?? String(value)
}

function formatYesNo(_component, value) {
  return value === true ? 'Yes' : 'No'
}

function formatCheckboxes(component, value) {
  if (!Array.isArray(value)) {
    return String(value)
  }
  return value.map((v) => lookupItemLabel(component, v)).join(', ')
}

function formatDateParts(_component, value) {
  if (typeof value === 'object' && value.day && value.month && value.year) {
    const monthName = MONTH_NAMES[Number(value.month) - 1] || value.month
    return `${Number(value.day)} ${monthName} ${value.year}`
  }
  return String(value)
}

function formatMonthYear(_component, value) {
  if (typeof value === 'object' && value.month && value.year) {
    const monthName = MONTH_NAMES[Number(value.month) - 1] || value.month
    return `${monthName} ${value.year}`
  }
  return String(value)
}

function formatItemLookup(component, value) {
  return lookupItemLabel(component, value)
}

function formatUkAddress(_component, value) {
  if (typeof value === 'object') {
    return [value.addressLine1, value.addressLine2, value.town, value.county, value.postcode].filter(Boolean).join('\n')
  }
  return String(value)
}

function formatStringValue(_component, value) {
  return String(value)
}

const FORMATTERS = {
  [COMPONENT_TYPES.YesNoField]: formatYesNo,
  [COMPONENT_TYPES.CheckboxesField]: formatCheckboxes,
  [COMPONENT_TYPES.DatePartsField]: formatDateParts,
  [COMPONENT_TYPES.MonthYearField]: formatMonthYear,
  [COMPONENT_TYPES.RadiosField]: formatItemLookup,
  [COMPONENT_TYPES.SelectField]: formatItemLookup,
  [COMPONENT_TYPES.AutocompleteField]: formatItemLookup,
  [COMPONENT_TYPES.UkAddressField]: formatUkAddress,
  [COMPONENT_TYPES.TextField]: formatStringValue,
  [COMPONENT_TYPES.NumberField]: formatStringValue,
  [COMPONENT_TYPES.EmailAddressField]: formatStringValue,
  [COMPONENT_TYPES.TelephoneNumberField]: formatStringValue,
  [COMPONENT_TYPES.MultilineTextField]: formatStringValue
}

/**
 * Formats a raw answer value based on the component type
 * @param {object} component - The form component definition
 * @param {*} value - The raw answer value
 * @returns {string} Formatted answer string
 */
export function formatAnswer(component, value) {
  if (value === undefined || value === null) {
    return ''
  }

  const formatter = FORMATTERS[component.type]
  return formatter ? formatter(component, value) : String(value)
}
