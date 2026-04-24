import { formatPrice } from '~/src/server/common/utils/payment.js'
import { landActionWithCode } from '~/src/server/land-grants/utils/land-action-with-code.js'

/**
 * Builds a print-friendly view model from payment data.
 * Returns null when there is no payment data or parcelItems is empty.
 * @param {object | undefined} payment
 * @returns {{ totalAnnualPayment: string, parcelItems: object[], additionalPayments: object[] } | null}
 */
export function buildPrintPaymentViewModel(payment) {
  if (!payment?.parcelItems || !Object.keys(payment.parcelItems).length) {
    return null
  }

  return {
    totalAnnualPayment: formatPrice(payment.annualTotalPence),
    parcelItems: buildPrintParcelItems(payment),
    additionalPayments: buildPrintAdditionalPayments(payment)
  }
}

/**
 * Groups parcel items by sheetId + parcelId into summary cards with table rows.
 * @param {object} payment
 * @returns {Array<{ cardTitle: string, items: Array<Array<object>> }>}
 */
export function buildPrintParcelItems(payment) {
  const grouped = Object.values(payment.parcelItems || {}).reduce((acc, data) => {
    const parcelKey = `${data.sheetId} ${data.parcelId}`

    if (!acc[parcelKey]) {
      acc[parcelKey] = {
        cardTitle: `Land parcel ID ${parcelKey}`,
        items: []
      }
    }

    acc[parcelKey].items.push([
      { text: landActionWithCode(data.description, data.code) },
      { text: data.quantity, format: 'numeric' },
      { text: formatPrice(data.annualPaymentPence), format: 'numeric' }
    ])

    return acc
  }, {})

  return Object.values(grouped)
}

/**
 * Maps agreement-level items into table rows for additional annual payments.
 * @param {object} payment
 * @returns {Array<Array<object>>}
 */
export function buildPrintAdditionalPayments(payment) {
  return Object.values(payment.agreementLevelItems || {}).map((data) => [
    {
      text: `Additional payment per agreement per year for ${landActionWithCode(data.description, data.code)}`
    },
    {
      text: formatPrice(data.annualPaymentPence),
      format: 'numeric'
    }
  ])
}
