import { formatPhone } from '~/src/server/land-grants/utils/format-phone.js'
import { escapeHtml } from '~/src/server/common/utils/escape-html.js'

/**
 * Phone numbers formatter - formats landline and mobile phone numbers with prefixes
 * @param {{ landline?: string, mobile?: string } | null | undefined} value - Phone numbers object
 * @returns {{ html: string } | null} Formatted value object or null if empty
 */
export function phoneNumbersFormatter(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const parts = []

  if (value.landline) {
    parts.push(`Telephone: ${escapeHtml(formatPhone(value.landline))}`)
  }

  if (value.mobile) {
    parts.push(`Mobile: ${escapeHtml(formatPhone(value.mobile))}`)
  }

  if (parts.length === 0) {
    return null
  }

  return { html: parts.join('<br/>') }
}
