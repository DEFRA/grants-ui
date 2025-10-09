/**
 * @param {Parameters<Intl.NumberFormat['format']>[0]} value
 * @param {Intl.LocalesArgument} locale
 * @param {string} currency
 * @param {number} maximumFractionDigits
 * @param {keyof Intl.NumberFormatOptionsStyleRegistry} style
 * @return {string}
 */
export function formatCurrency(
  value,
  locale = 'en-GB',
  currency = 'GBP',
  maximumFractionDigits = 2,
  style = 'currency'
) {
  const options = {
    style,
    maximumFractionDigits
  }

  if (style === 'currency') {
    options.currency = currency
  }

  return new Intl.NumberFormat(locale, options).format(value)
}
