import { COMPONENT_TYPES, MONTH_NAMES } from '~/src/server/common/helpers/print-application-service/constants.js'

/**
 * Converts an unexpected value to a string without producing '[object Object]'.
 * @param {unknown} value
 * @returns {string}
 */
function stringifyValue(value) {
  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * Looks up the display text for a value from a component's items list
 * @param {Component} component
 * @param {unknown} value
 * @returns {string}
 */
function lookupItemLabel(component, value) {
  const items = component.items || /** @type {{ items?: ListItem[] }} */ (component.list)?.items || []
  const match = items.find((item) => item.value === value)
  return match?.text ?? stringifyValue(value)
}

/**
 * @param {Component} _component
 * @param {unknown} value
 * @returns {string}
 */
function formatYesNo(_component, value) {
  return value === true ? 'Yes' : 'No'
}

/**
 * @param {Component} component
 * @param {unknown} value
 * @returns {string}
 */
function formatCheckboxes(component, value) {
  if (!Array.isArray(value)) {
    return stringifyValue(value)
  }
  return value.map((v) => lookupItemLabel(component, v)).join(', ')
}

/**
 * @param {Component} _component
 * @param {{ day?: string, month?: string, year?: string }} value
 * @returns {string}
 */
function formatDateParts(_component, value) {
  if (typeof value === 'object' && value.day && value.month && value.year) {
    const monthName = MONTH_NAMES[Number(value.month) - 1] || value.month
    return `${Number(value.day)} ${monthName} ${value.year}`
  }
  return stringifyValue(value)
}

/**
 * @param {Component} _component
 * @param {{ month?: string, year?: string }} value
 * @returns {string}
 */
function formatMonthYear(_component, value) {
  if (typeof value === 'object' && value.month && value.year) {
    const monthName = MONTH_NAMES[Number(value.month) - 1] || value.month
    return `${monthName} ${value.year}`
  }
  return stringifyValue(value)
}

/**
 * @param {Component} component
 * @param {unknown} value
 * @returns {string}
 */
function formatItemLookup(component, value) {
  return lookupItemLabel(component, value)
}

/**
 * @param {Component} _component
 * @param {{ addressLine1?: string, addressLine2?: string, town?: string, county?: string, postcode?: string }} value
 * @returns {string}
 */
function formatUkAddress(_component, value) {
  if (typeof value === 'object') {
    return [value.addressLine1, value.addressLine2, value.town, value.county, value.postcode].filter(Boolean).join(', ')
  }
  return stringifyValue(value)
}

/**
 * @param {Component} _component
 * @param {{ easting?: string | number, northing?: string | number }} value
 * @returns {string}
 */
function formatEastingNorthing(_component, value) {
  if (typeof value === 'object' && value.easting !== undefined && value.northing !== undefined) {
    return `${value.easting}, ${value.northing}`
  }
  return stringifyValue(value)
}

/**
 * @param {Component} _component
 * @param {{ latitude?: string | number, longitude?: string | number }} value
 * @returns {string}
 */
function formatLatLong(_component, value) {
  if (typeof value === 'object' && value.latitude !== undefined && value.longitude !== undefined) {
    return `${value.latitude}, ${value.longitude}`
  }
  return stringifyValue(value)
}

/**
 * @param {Component} _component
 * @param {unknown} value
 * @returns {string}
 */
function formatGeospatial(_component, value) {
  if (Array.isArray(value)) {
    const unit = value.length === 1 ? 'feature' : 'features'
    return `${value.length} ${unit}`
  }
  return stringifyValue(value)
}

/**
 * @param {Component} _component
 * @param {unknown} value
 * @returns {string}
 */
function formatStringValue(_component, value) {
  return stringifyValue(value)
}

/** @type {Record<string, (component: Component, value: any) => string>} */
const FORMATTERS = {
  [COMPONENT_TYPES.YesNoField]: formatYesNo,
  [COMPONENT_TYPES.CheckboxesField]: formatCheckboxes,
  [COMPONENT_TYPES.DatePartsField]: formatDateParts,
  [COMPONENT_TYPES.MonthYearField]: formatMonthYear,
  [COMPONENT_TYPES.RadiosField]: formatItemLookup,
  [COMPONENT_TYPES.SelectField]: formatItemLookup,
  [COMPONENT_TYPES.AutocompleteField]: formatItemLookup,
  [COMPONENT_TYPES.UkAddressField]: formatUkAddress,
  [COMPONENT_TYPES.EastingNorthingField]: formatEastingNorthing,
  [COMPONENT_TYPES.LatLongField]: formatLatLong,
  [COMPONENT_TYPES.GeospatialField]: formatGeospatial,
  [COMPONENT_TYPES.TextField]: formatStringValue,
  [COMPONENT_TYPES.NumberField]: formatStringValue,
  [COMPONENT_TYPES.EmailAddressField]: formatStringValue,
  [COMPONENT_TYPES.TelephoneNumberField]: formatStringValue,
  [COMPONENT_TYPES.MultilineTextField]: formatStringValue,
  [COMPONENT_TYPES.OsGridRefField]: formatStringValue,
  [COMPONENT_TYPES.NationalGridFieldNumberField]: formatStringValue,
  [COMPONENT_TYPES.HiddenField]: formatStringValue
}

/**
 * Formats a raw answer value based on the component type
 * @param {Component} component - The form component definition
 * @param {unknown} value - The raw answer value
 * @returns {string} Formatted answer string
 */
export function formatAnswer(component, value) {
  if (value === undefined || value === null) {
    return ''
  }

  const formatter = FORMATTERS[component.type]
  return formatter ? formatter(component, value) : stringifyValue(value)
}

/**
 * @typedef {{ text?: string, value?: unknown }} ListItem
 * @typedef {{ type: string, items?: ListItem[], list?: string | { items?: ListItem[] } }} Component
 */
