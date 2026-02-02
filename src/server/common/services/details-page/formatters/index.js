import { textFormatter } from './text.formatter.js'
import { fullNameFormatter } from './full-name.formatter.js'
import { addressFormatter } from './address.formatter.js'
import { contactDetailsFormatter } from './contact-details.formatter.js'

/**
 * Registry of available formatters
 */
const formatters = {
  text: textFormatter,
  fullName: fullNameFormatter,
  address: addressFormatter,
  contactDetails: contactDetailsFormatter
}

/**
 * Get a formatter by name
 * @param {string} name - The formatter name
 * @returns {Function} The formatter function, defaults to textFormatter if not found
 */
export function getFormatter(name) {
  return formatters[name] || formatters.text
}

export { textFormatter } from './text.formatter.js'
export { fullNameFormatter } from './full-name.formatter.js'
export { addressFormatter } from './address.formatter.js'
export { contactDetailsFormatter } from './contact-details.formatter.js'
