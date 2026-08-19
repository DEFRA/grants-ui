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
 * Builds the displayed action label as "Description (CODE)", or just the code
 * when the API omits the description. Not the shared `landActionWithCode()`
 * helper, whose "Description: CODE" form is what the payment and submission
 * paths still send downstream.
 * @param {unknown} description
 * @param {string} code
 * @returns {string}
 */
const formatActionLabel = (description, code) => (isNonEmptyString(description) ? `${description} (${code})` : code)

/**
 * Joins the quantity and unit, skipping either half when the API omits it so the
 * output never contains "undefined". A numeric quantity gets four decimal places
 * so the areas line up down the column; any other value passes through
 * unchanged rather than being validated here.
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
 * Works out a parcel's total, used and available area from persisted state
 * rather than the payment API, which is authoritative for money only. Used area
 * comes from the state actions because an action priced at agreement level still
 * occupies parcel area, so it is missing from `payment.parcelItems`.
 *
 * Returns nothing unless the parcel has a usable size and every action has a
 * finite value in the parcel's unit, so the rows never show partial or
 * misleading arithmetic. The sums run in integer ten-thousandths, which makes
 * `44.8765 - 44` exactly `0.8765`. Available area is not clamped, because a
 * negative result is real and has to be shown.
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
 * Builds the view model for the "Your land and actions" payment summary page. It
 * groups the API response for display and never looks up rates, multiplies
 * quantities, rounds, or works out the application total, which always comes
 * from the API's `annualTotalPence`.
 *
 * The response is rendered as received. Agreement-level items get their own
 * section because they count towards `annualTotalPence` without belonging to any
 * one parcel, and a selected action or parcel the API prices at agreement level,
 * or does not price at all, is a normal response rather than an error. See
 * `src/contracts/v2/land-grants.client.contract.test.js`.
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

  const parcels = seedParcelsInSelectionOrder(landParcels)
  addPricedParcelActions(parcels, payment, landParcels)

  return {
    parcels: [...parcels.values()]
      .filter((parcel) => parcel.actions.length > 0)
      .map(({ reference, removeHref, areaSummary, actions, totalPence }) => ({
        reference,
        removeHref,
        areaSummary,
        actions,
        yearlyPayment: formatPrice(totalPence)
      })),
    additionalYearlyPayments: buildAdditionalYearlyPayments(payment),
    applicationYearlyPayment: formatPrice(payment.annualTotalPence)
  }
}

/**
 * Empty card for one parcel, ready to collect the actions the API priced against
 * it.
 * @param {string} sheetId
 * @param {string} parcelId
 * @param {LandParcels} [landParcels]
 * @returns {ParcelCard}
 */
function buildParcelCard(sheetId, parcelId, landParcels) {
  return {
    reference: landParcelReference(sheetId, parcelId),
    removeHref: removeParcelHref(sheetId, parcelId),
    areaSummary: buildAreaSummary(landParcels?.[stringifyParcel({ sheetId, parcelId })]),
    actions: [],
    totalPence: 0
  }
}

/**
 * Builds the card map in state order so the cards match the order the user picked
 * the parcels on the earlier pages. `payment.parcelItems` is keyed by
 * integer-like ids, which JS iterates in ascending numeric order, so ordering by
 * the response would follow upstream item numbering instead.
 * @param {LandParcels} [landParcels]
 * @returns {Map<string, ParcelCard>}
 */
function seedParcelsInSelectionOrder(landParcels) {
  /** @type {Map<string, ParcelCard>} */
  const parcels = new Map()

  for (const parcelKey of Object.keys(landParcels ?? {})) {
    const [sheetId, parcelId] = parcelKey.split('-')
    if (isNonEmptyString(sheetId) && isNonEmptyString(parcelId)) {
      parcels.set(parcelKey, buildParcelCard(sheetId, parcelId, landParcels))
    }
  }

  return parcels
}

/**
 * Adds the API's priced parcel items to the cards, creating a card for any parcel
 * the response prices that state did not provide.
 * @param {Map<string, ParcelCard>} parcels
 * @param {PaymentCalculation} payment
 * @param {LandParcels} [landParcels]
 * @throws {SystemError} when a rendered money field or parcel identifier is malformed
 */
function addPricedParcelActions(parcels, payment, landParcels) {
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
      parcel = buildParcelCard(sheetId, parcelId, landParcels)
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
}

/**
 * Agreement-level items contribute to `annualTotalPence` without belonging to
 * any single parcel, so they get their own section.
 * @param {PaymentCalculation} payment
 * @returns {ConfirmLandAndActionsAdditionalPaymentViewModel[]}
 * @throws {SystemError} when a rendered money field is malformed
 */
function buildAdditionalYearlyPayments(payment) {
  return Object.values(payment.agreementLevelItems ?? {}).map((item) => {
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
 * Mutable accumulator behind a parcel card. Holds the parcel total in pence so it
 * is formatted once, after every priced action has been added.
 * @typedef {object} ParcelCard
 * @property {string} reference - Bare land parcel reference, e.g. `SD1234 5678`
 * @property {string} removeHref - Link to remove the whole parcel
 * @property {ConfirmLandAndActionsAreaSummaryViewModel} [areaSummary] - Omitted when state cannot support it
 * @property {ConfirmLandAndActionsActionViewModel[]} actions - Action rows accumulated so far
 * @property {number} totalPence - Running total for this parcel
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
