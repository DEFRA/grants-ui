import {
  calculateLandActionsPayment,
  calculateWmpPayment,
  fetchParcelsGroups
} from '~/src/server/land-grants/services/land-grants.service.js'
import {
  mapPaymentInfoToParcelItems,
  mapAdditionalYearlyPayments
} from '~/src/server/land-grants/view-models/payment.view-model.js'

/**
 * Registry of payment strategies keyed by name.
 * Referenced from the form definition YAML via `config.paymentStrategy`.
 *
 * Each strategy exposes a single `fetch(state)` method that returns:
 *   { totalPence, payment, parcelItems, additionalYearlyPayments }
 *
 * - `totalPence`              — normalised display amount (used by controller for all journeys)
 * - `payment`                 — raw API response object, stored in state for downstream use (e.g. GAS mapper)
 * - `parcelItems`             — mapped view models for per-parcel tables (empty if not applicable)
 * - `additionalYearlyPayments`— mapped view models for agreement-level items (empty if not applicable)
 *
 * To add a new journey:
 *   1. Add an entry below with a `fetch` method
 *   2. Set `paymentStrategy: <key>` in the YAML page config
 *
 * @type {Record<string, { fetch: (state: object) => Promise<{ totalPence: number, payment: object, parcelItems?: Array, additionalYearlyPayments?: Array }> }>}
 */
export const paymentStrategies = {
  multiAction: {
    async fetch(state) {
      const [paymentResult, actionGroups] = await Promise.all([
        calculateLandActionsPayment(state),
        fetchParcelsGroups(state)
      ])
      const { payment } = paymentResult
      return {
        totalPence: payment?.annualTotalPence ?? 0,
        payment,
        parcelItems: mapPaymentInfoToParcelItems(payment, actionGroups),
        additionalYearlyPayments: mapAdditionalYearlyPayments(payment)
      }
    }
  },

  oneOff: {
    async fetch(state) {
      const { parcelIds = [], youngWoodlandArea = 0, oldWoodlandArea = 0 } = state
      const { result, totalPence } = await calculateWmpPayment({ parcelIds, youngWoodlandArea, oldWoodlandArea })
      return {
        totalPence,
        payment: { result }
      }
    }
  }
}
