/**
 * @param {Parameters<Intl.NumberFormat['format']>[0]} value
 * @param {Intl.LocalesArgument} locale
 * @param {string} currency
 */
export function formatCurrency(value, locale = 'en-GB', currency = 'GBP') {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  })

  return formatter.format(value)
}
