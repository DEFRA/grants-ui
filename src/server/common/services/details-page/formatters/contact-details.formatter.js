import { formatPhone } from '~/src/server/land-grants/utils/format-phone.js'

/**
 * Contact details formatter - formats phone and email as HTML with line breaks
 * @param {string[]} values - Array of contact values [phone, email]
 * @returns {{ html: string } | null} Formatted value object or null if empty
 */
export function contactDetailsFormatter(values) {
  if (!Array.isArray(values)) {
    return null
  }

  const contactParts = []
  const [phone, email] = values

  if (phone) {
    contactParts.push(formatPhone(phone))
  }

  if (email) {
    contactParts.push(email)
  }

  if (contactParts.length === 0) {
    return null
  }

  return { html: contactParts.join('<br/>') }
}
