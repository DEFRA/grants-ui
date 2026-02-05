import { escapeHtml } from '~/src/server/common/utils/escape-html.js'

/**
 * Address formatter - formats address object as HTML with line breaks
 * @param {object} value - Address object with line1, line2, etc. properties
 * @returns {{ html: string } | null} Formatted value object or null if empty
 */
export function addressFormatter(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const addressParts = [value.line1, value.line2, value.line3, value.street, value.city, value.postalCode]
    .filter(Boolean)
    .map((part) => escapeHtml(String(part).trim()))
    .filter((part) => part.length > 0)

  if (addressParts.length === 0) {
    return null
  }

  return { html: addressParts.join('<br/>') }
}
