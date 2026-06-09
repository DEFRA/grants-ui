import { escapeHtml } from '~/src/server/common/utils/escape-html.js'

/**
 * @typedef {object} Address
 * @property {string|null} line1
 * @property {string|null} [line2]
 * @property {string|null} [line3]
 * @property {string|null} [line4]
 * @property {string|null} city
 * @property {string|null} postalCode
 */

/**
 * Address formatter - formats address object as HTML with line breaks
 * @param {Address} value - Address object with line1, line2, etc. properties
 * @returns {{ html: string } | null} Formatted value object or null if empty
 */
export function addressFormatter(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const parts = [value.line1, value.line2, value.line3, value.line4, value.city, value.postalCode]
    .filter(Boolean)
    .map((part) => escapeHtml(String(part).trim()))
    .filter((part) => part.length > 0)

  if (parts.length === 0) {
    return null
  }

  return { html: parts.join('<br/>') }
}
