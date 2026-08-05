import { landActionWithCode } from '~/src/server/land-grants/utils/land-action-with-code.js'
import { stringifyParcel } from '~/src/shared/format-parcel.js'
import { formatPrice } from '~/src/server/common/utils/payment.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

const SOURCE = 'buildConfirmLandAndActionsViewModel'
const REASON = 'invalid_payment_response'

/**
 * @param {string} message
 * @returns {SystemError}
 */
function invalidResponse(message) {
  return new SystemError({ message, source: SOURCE, reason: REASON })
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isNonNegativeInteger = (value) => Number.isInteger(value) && /** @type {number} */ (value) >= 0

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function sameSet(a, b) {
  if (a.length !== b.length) {
    return false
  }
  const setB = new Set(b)
  return a.every((value) => setB.has(value))
}

/**
 * Builds the presentation model for the generic "Your land and actions"
 * payment-summary page. Performs presentation grouping only: it never looks up
 * rates, multiplies quantities, rounds, or computes the application total. The
 * application total always comes from the API-derived `paymentTotal`.
 *
 * @param {PaymentCalculation} payment - Raw payment calculation from the API
 * @param {string} paymentTotal - Formatted application total (API annualTotalPence)
 * @param {LandParcels} landParcels - Current state land parcels
 * @returns {ConfirmLandAndActionsViewModel}
 * @throws {SystemError} when the response or state fails validation
 */
export function buildConfirmLandAndActionsViewModel(payment, paymentTotal, landParcels) {
  if (!isNonNegativeInteger(payment?.annualTotalPence)) {
    throw invalidResponse('payment.annualTotalPence must be a non-negative integer')
  }
  if (!isNonEmptyString(paymentTotal)) {
    throw invalidResponse('paymentTotal must be a non-empty string')
  }
  if (!landParcels || typeof landParcels !== 'object' || Object.keys(landParcels).length === 0) {
    throw invalidResponse('landParcels must be a non-empty object')
  }
  const parcelItems = Object.values(payment.parcelItems ?? {})
  if (parcelItems.length === 0) {
    throw invalidResponse('payment.parcelItems must contain at least one item')
  }

  /** @type {Map<string, { parcelId: string, title: string, removeHref: string, actions: object[], totalPence: number, codes: string[] }>} */
  const parcels = new Map()

  for (const item of parcelItems) {
    const { code, sheetId, parcelId, annualPaymentPence, description, quantity, unit } = item

    if (!isNonNegativeInteger(annualPaymentPence)) {
      throw invalidResponse(`annualPaymentPence must be a non-negative integer for action "${code}"`)
    }
    if (!isNonEmptyString(code) || !isNonEmptyString(sheetId) || !isNonEmptyString(parcelId)) {
      throw invalidResponse('parcel item requires non-empty code, sheetId and parcelId')
    }

    const parcelKey = stringifyParcel({ sheetId, parcelId })

    let parcel = parcels.get(parcelKey)
    if (!parcel) {
      parcel = {
        parcelId: parcelKey,
        title: `Land parcel ${sheetId} ${parcelId}`,
        removeHref: `remove-parcel?parcelId=${parcelKey}`,
        actions: [],
        totalPence: 0,
        codes: []
      }
      parcels.set(parcelKey, parcel)
    }

    parcel.actions.push({
      action: landActionWithCode(description, code),
      area: `${quantity} ${unit}`,
      yearlyPayment: formatPrice(annualPaymentPence),
      changeHref: `select-actions-for-land-parcel?parcelId=${parcelKey}`,
      removeHref: `remove-action?parcelId=${parcelKey}&action=${code}`
    })
    parcel.totalPence += annualPaymentPence
    parcel.codes.push(code)
  }

  const responseParcelKeys = [...parcels.keys()]
  const stateParcelKeys = Object.keys(landParcels)
  if (!sameSet(responseParcelKeys, stateParcelKeys)) {
    throw invalidResponse('response parcels do not match selected land parcels')
  }

  for (const [parcelKey, parcel] of parcels) {
    const expectedCodes = Object.keys(landParcels[parcelKey].actionsObj ?? {})
    if (new Set(parcel.codes).size !== parcel.codes.length) {
      throw invalidResponse(`duplicate action returned for parcel "${parcelKey}"`)
    }
    if (!sameSet(parcel.codes, expectedCodes)) {
      throw invalidResponse(`response actions do not match selected actions for parcel "${parcelKey}"`)
    }
  }

  return {
    parcels: [...parcels.values()].map(({ parcelId, title, removeHref, actions, totalPence }) => ({
      parcelId,
      title,
      removeHref,
      actions,
      yearlyPayment: formatPrice(totalPence)
    })),
    applicationYearlyPayment: paymentTotal
  }
}

/**
 * @typedef {object} ConfirmLandAndActionsActionViewModel
 * @property {string} action - Action description with code
 * @property {string} area - Formatted area (quantity + unit)
 * @property {string} yearlyPayment - Formatted action yearly payment
 * @property {string} changeHref - Change link href
 * @property {string} removeHref - Remove link href
 */

/**
 * @typedef {object} ConfirmLandAndActionsParcelViewModel
 * @property {string} parcelId - State parcel key (sheetId-parcelId)
 * @property {string} title - Card title
 * @property {string} removeHref - Remove parcel link href
 * @property {ConfirmLandAndActionsActionViewModel[]} actions - Action rows
 * @property {string} yearlyPayment - Formatted parcel yearly total
 */

/**
 * @typedef {object} ConfirmLandAndActionsViewModel
 * @property {ConfirmLandAndActionsParcelViewModel[]} parcels - Parcel cards
 * @property {string} applicationYearlyPayment - Formatted application yearly total
 */

/**
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { LandParcels } from '~/src/server/land-grants/types/form-state.d.js'
 */
