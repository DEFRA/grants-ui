/**
 * @param {Parameters<Intl.NumberFormat['format']>[0]} value
 * @param {Intl.LocalesArgument} locale
 * @param {string} currency
 * @param {number} maximumFractionDigits
 * @param {keyof Intl.NumberFormatOptionsStyleRegistry} style
 * @returns {string}
 */
export function formatCurrency(
  value,
  locale = 'en-GB',
  currency = 'GBP',
  maximumFractionDigits = 2,
  style = 'currency'
) {
  /** @type {Intl.NumberFormatOptions} */
  const options = {
    style,
    maximumFractionDigits
  }

  if (style === 'currency') {
    options.currency = currency
  }

  return new Intl.NumberFormat(locale, options).format(value)
}
