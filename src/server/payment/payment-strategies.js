import {
  calculateLandActionsPayment,
  calculateWmpPayment,
  fetchParcelsGroups
} from '~/src/server/land-grants/services/land-grants.service.js'
import {
  mapPaymentInfoToParcelItems,
  mapAdditionalYearlyPayments
} from '~/src/server/land-grants/view-models/payment.view-model.js'
import { formatPrice } from '~/src/server/common/utils/payment.js'

/**
 * Registry of payment strategies keyed by name.
 * Referenced from the form definition YAML via `config.paymentStrategy`.
 *
 * Each strategy exposes a single `fetch(state)` method that returns:
 *   { totalPence, totalPayment, payment, parcelItems?, additionalYearlyPayments? }
 *
 * - `totalPence`              — raw amount in pence, stored in state for re-render on validation errors
 * - `totalPayment`            — formatted currency string e.g. "£4,393.68", rendered in the view
 * - `payment`                 — raw API response object, stored in state for downstream use (e.g. GAS mapper)
 * - `parcelItems`             — mapped view models for per-parcel tables (empty if not applicable)
 * - `additionalYearlyPayments`— mapped view models for agreement-level items (empty if not applicable)
 *
 * To add a new journey:
 *   1. Add an entry below with a `fetch` method
 *   2. Set `paymentStrategy: <key>` in the YAML page config
 *
 * @type {Record<string, { fetch: (state: object) => Promise<{ totalPence: number, totalPayment: string, payment: object, parcelItems?: Array, additionalYearlyPayments?: Array }> }>}
 */
export const paymentStrategies = {
  multiAction: {
    async fetch(state) {
      const [paymentResult, actionGroups] = await Promise.all([
        calculateLandActionsPayment(state),
        fetchParcelsGroups(state)
      ])
      const { payment } = paymentResult
      const totalPence = payment?.annualTotalPence ?? 0
      return {
        totalPence,
        totalPayment: formatPrice(totalPence),
        payment,
        parcelItems: mapPaymentInfoToParcelItems(payment, actionGroups),
        additionalYearlyPayments: mapAdditionalYearlyPayments(payment)
      }
    }
  },

  wmp: {
    async fetch(state) {
      const { parcelIds = [], newWoodlandAreaHa = 0, oldWoodlandAreaHa = 0 } = state
      const { payment, totalPence } = await calculateWmpPayment({ parcelIds, newWoodlandAreaHa, oldWoodlandAreaHa })
      return {
        totalPence,
        totalPayment: formatPrice(totalPence),
        payment
      }
    }
  }
}
