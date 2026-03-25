import { formatCurrency } from '~/src/config/nunjucks/filters/filters.js'

/**
 * Format a pence value as a GBP currency string.
 * @param {number} value - Value in pence
 * @returns {string} - Formatted currency string e.g. "£4,393.68"
 */
export function formatPrice(value) {
  return formatCurrency(value / 100, 'en-GB', 'GBP', 2, 'currency')
}
