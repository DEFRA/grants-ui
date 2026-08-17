import { formatPrice } from '~/src/server/common/utils/payment.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'
import { stringifyParcel } from '~/src/shared/format-parcel.js'
import {
  changeActionsHref,
  landParcelReference,
  removeParcelHref
} from '~/src/server/land-grants/view-models/land-parcel-links.js'

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
 * Renders an action label in the visible form "Description (CODE)", falling
 * back to the bare code when the API omits the description. Deliberately not
 * the shared `landActionWithCode()` helper: its "Description: CODE" form is
 * still what the payment and submission paths send downstream.
 * @param {unknown} description
 * @param {string} code
 * @returns {string}
 */
const formatActionLabel = (description, code) => (isNonEmptyString(description) ? `${description} (${code})` : code)

/**
 * Renders the quantity/unit pair without emitting "undefined" when the API
 * omits either half. A numeric quantity is shown to four decimal places so
 * areas line up column-wise with the design; anything else is passed through
 * untouched rather than validated here.
 * @param {unknown} quantity
 * @param {unknown} unit
 * @returns {string}
 */
const formatArea = (quantity, unit) => {
  const area = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity.toFixed(4) : quantity
  return [area, unit].filter((part) => part !== undefined && part !== null && part !== '').join(' ')
}

const AREA_SCALE = 10_000

/**
 * @param {unknown} value
 * @returns {value is number}
 */
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * Renders a scaled area (integer ten-thousandths) back as a four-decimal area.
 * @param {number} scaled
 * @param {string} unit
 * @returns {string}
 */
const formatScaledArea = (scaled, unit) => `${(scaled / AREA_SCALE).toFixed(4)} ${unit}`

/**
 * Derives a parcel's total/used/available area from persisted state alone - the
 * payment API is authoritative for money only. State actions define used area
 * because an action priced at agreement level still occupies parcel area, so it
 * is absent from `payment.parcelItems` while still consuming land.
 *
 * All or nothing: without a usable size, or with any action whose value is not
 * finite or whose unit differs from the parcel's, the rows are omitted rather
 * than showing partial or misleading arithmetic. Arithmetic runs in integer
 * ten-thousandths so `44.8765 - 44` is exactly `0.8765`, and available area is
 * never clamped - a negative result is real and must be shown.
 *
 * @param {LandParcel} [parcel] - Persisted state for this land parcel
 * @returns {{ total: string, used: string, available: string } | undefined}
 */
function buildAreaSummary(parcel) {
  const unit = parcel?.size?.unit
  const total = parcel?.size?.value

  if (!isFiniteNumber(total) || typeof unit !== 'string' || unit.trim() === '') {
    return undefined
  }

  const actions = Object.values(parcel?.actionsObj ?? {})
  if (!actions.length || !actions.every((action) => isFiniteNumber(action.value) && action.unit === unit)) {
    return undefined
  }

  const totalScaled = Math.round(total * AREA_SCALE)
  const usedScaled = actions.reduce((sum, action) => sum + Math.round(action.value * AREA_SCALE), 0)

  return {
    total: formatScaledArea(totalScaled, unit),
    used: formatScaledArea(usedScaled, unit),
    available: formatScaledArea(totalScaled - usedScaled, unit)
  }
}

/**
 * Builds the presentation model for the generic "Your land and actions"
 * payment-summary page. Performs presentation grouping only: it never looks up
 * rates, multiplies quantities, rounds, or computes the application total. The
 * application total always comes from the API's `annualTotalPence`.
 *
 * The response is rendered as received. Agreement-level items are shown in
 * their own section because they contribute to `annualTotalPence` without
 * belonging to any single parcel, and a selected action or parcel that the API
 * prices at agreement level (or does not price at all) is a normal response
 * rather than an error - see `src/contracts/v2/land-grants.client.contract.test.js`.
 *
 * @param {PaymentCalculation} payment - Raw payment calculation from the API
 * @param {LandParcels} [landParcels] - Current state land parcels, used only to order the cards
 * @returns {ConfirmLandAndActionsViewModel}
 * @throws {SystemError} when a rendered money field or parcel identifier is malformed
 */
export function buildConfirmLandAndActionsViewModel(payment, landParcels) {
  if (!isNonNegativeInteger(payment?.annualTotalPence)) {
    throw invalidResponse('payment.annualTotalPence must be a non-negative integer')
  }

  /**
   * @type {Map<string, { reference: string, removeHref: string,
   *   areaSummary?: { total: string, used: string, available: string },
   *   actions: ConfirmLandAndActionsActionViewModel[], totalPence: number }>}
   */
  const parcels = new Map()

  // Seed the map in selection order so the cards match the order the user
  // picked the parcels on the earlier pages. `payment.parcelItems` is keyed by
  // integer-like ids, which JS iterates in ascending numeric order, so relying
  // on it alone would order the page by upstream item numbering instead.
  for (const parcelKey of Object.keys(landParcels ?? {})) {
    const [sheetId, parcelId] = parcelKey.split('-')
    if (isNonEmptyString(sheetId) && isNonEmptyString(parcelId)) {
      parcels.set(parcelKey, {
        reference: landParcelReference(sheetId, parcelId),
        removeHref: removeParcelHref(sheetId, parcelId),
        areaSummary: buildAreaSummary(landParcels?.[parcelKey]),
        actions: [],
        totalPence: 0
      })
    }
  }

  for (const item of Object.values(payment.parcelItems ?? {})) {
    const { code, sheetId, parcelId, annualPaymentPence, description, quantity, unit } = item

    if (!isNonEmptyString(code) || !isNonEmptyString(sheetId) || !isNonEmptyString(parcelId)) {
      throw invalidResponse('parcel item requires non-empty code, sheetId and parcelId')
    }
    if (!isNonNegativeInteger(annualPaymentPence)) {
      throw invalidResponse(`annualPaymentPence must be a non-negative integer for action "${code}"`)
    }

    const parcelKey = stringifyParcel({ sheetId, parcelId })

    let parcel = parcels.get(parcelKey)
    if (!parcel) {
      parcel = {
        reference: landParcelReference(sheetId, parcelId),
        removeHref: removeParcelHref(sheetId, parcelId),
        areaSummary: buildAreaSummary(landParcels?.[parcelKey]),
        actions: [],
        totalPence: 0
      }
      parcels.set(parcelKey, parcel)
    }

    parcel.actions.push({
      action: formatActionLabel(description, code),
      area: formatArea(quantity, unit),
      yearlyPayment: formatPrice(annualPaymentPence),
      changeHref: changeActionsHref(sheetId, parcelId)
    })
    parcel.totalPence += annualPaymentPence
  }

  /** @type {ConfirmLandAndActionsAdditionalPaymentViewModel[]} */
  const additionalYearlyPayments = Object.values(payment.agreementLevelItems ?? {}).map((item) => {
    const { code, description, annualPaymentPence } = item

    if (!isNonEmptyString(code)) {
      throw invalidResponse('agreement level item requires a non-empty code')
    }
    if (!isNonNegativeInteger(annualPaymentPence)) {
      throw invalidResponse(`annualPaymentPence must be a non-negative integer for action "${code}"`)
    }

    return {
      action: formatActionLabel(description, code),
      yearlyPayment: formatPrice(annualPaymentPence)
    }
  })

  return {
    // Only parcels the API actually priced get a card; a parcel selected with no
    // actions yet is a valid state (the pre-submission gate allows it) and must
    // not blank the whole page.
    parcels: [...parcels.values()]
      .filter((parcel) => parcel.actions.length > 0)
      .map(({ reference, removeHref, areaSummary, actions, totalPence }) => ({
        reference,
        removeHref,
        areaSummary,
        actions,
        yearlyPayment: formatPrice(totalPence)
      })),
    additionalYearlyPayments,
    applicationYearlyPayment: formatPrice(payment.annualTotalPence)
  }
}

/**
 * @typedef {object} ConfirmLandAndActionsActionViewModel
 * @property {string} action - Action description with code
 * @property {string} area - Quantity and unit
 * @property {string} yearlyPayment - Formatted yearly payment
 * @property {string} changeHref - Link to change the parcel's actions
 */

/**
 * @typedef {object} ConfirmLandAndActionsAdditionalPaymentViewModel
 * @property {string} action - Action description with code
 * @property {string} yearlyPayment - Formatted yearly payment
 */

/**
 * @typedef {object} ConfirmLandAndActionsAreaSummaryViewModel
 * @property {string} total - Parcel total area
 * @property {string} used - Area claimed by this parcel's selected actions
 * @property {string} available - Total minus used; may be negative
 */

/**
 * @typedef {object} ConfirmLandAndActionsParcelViewModel
 * @property {string} reference - Bare land parcel reference, e.g. `SD1234 5678`
 * @property {string} removeHref - Link to remove the whole parcel
 * @property {ConfirmLandAndActionsAreaSummaryViewModel} [areaSummary] - Omitted when state cannot support it
 * @property {ConfirmLandAndActionsActionViewModel[]} actions - Action rows
 * @property {string} yearlyPayment - Formatted parcel total
 */

/**
 * @typedef {object} ConfirmLandAndActionsViewModel
 * @property {ConfirmLandAndActionsParcelViewModel[]} parcels - Parcel cards
 * @property {ConfirmLandAndActionsAdditionalPaymentViewModel[]} additionalYearlyPayments - Agreement-level payment rows
 * @property {string} applicationYearlyPayment - Formatted application yearly total
 */

/**
 * @import { PaymentCalculation } from '~/src/server/land-grants/types/payment.d.js'
 * @import { LandParcel, LandParcels } from '~/src/server/land-grants/types/form-state.d.js'
 */
