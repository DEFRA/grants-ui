import { formatCurrency } from '~/src/config/nunjucks/filters/format-currency.js'

/**
 * Format a pence value as a GBP currency string.
 * @param {number} value - Value in pence
 * @returns {string} - Formatted currency string e.g. "£4,393.68"
 */
export function formatPrice(value) {
  return formatCurrency((Number(value) || 0) / 100)
}

/**
 * Reformat a GBP total saved as a display string by an earlier payment calculation.
 * @param {string} value
 */
export function formatSavedPayment(value) {
  const amount = /^(-?)£((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?)$/.exec(value)
  return amount ? formatCurrency(Number(amount[1] + amount[2].replaceAll(',', ''))) : value
}
