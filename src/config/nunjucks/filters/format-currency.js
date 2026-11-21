import { createCurrencyNumberFormat } from '~/src/shared/format-number.js'

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
  const formatter =
    style === 'currency'
      ? createCurrencyNumberFormat(locale, currency, { maximumFractionDigits })
      : new Intl.NumberFormat(locale, { style, maximumFractionDigits })
  return formatter.format(value)
}
