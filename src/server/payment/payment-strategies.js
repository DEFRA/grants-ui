import {
  calculateLandActionsPayment,
  fetchParcelsGroups
} from '~/src/server/land-grants/services/land-grants.service.js'
import { calculateWmpPayment } from '~/src/server/woodland/woodland.service.js'
import {
  mapPaymentInfoToParcelItems,
  mapAdditionalYearlyPayments
} from '~/src/server/land-grants/view-models/payment.view-model.js'
import { formatPrice } from '~/src/server/common/utils/payment.js'

/**
 * Registry of payment strategies keyed by name.
 * Referenced from the form definition YAML via `config.paymentStrategy`.
 *
 * Each strategy exposes a single `calculatePayment(state, userContext)` method that returns:
 *   { totalPence, totalPayment, payment, parcelItems?, additionalYearlyPayments? }
 *
 * - `totalPence`              — raw amount in pence, stored in state for re-render on validation errors
 * - `totalPayment`            — formatted currency string e.g. "£4,393.68", rendered in the view
 * - `payment`                 — raw API response object, stored in state for downstream use (e.g. GAS mapper)
 * - `parcelItems`             — mapped view models for per-parcel tables (empty if not applicable)
 * - `additionalYearlyPayments`— mapped view models for agreement-level items (empty if not applicable)
 *
 * To add a new journey:
 *   1. Add an entry below with a `calculatePayment` method
 *   2. Set `paymentStrategy: <key>` in the YAML page config
 */
/** @type {Record<string, { calculatePayment: (state: object, userContext: LandGrantsUserContext) => Promise<PaymentStrategyResult> }>} */
export const paymentStrategies = {
  multiAction: {
    /**
     * @param {MultiActionState} state
     * @param {LandGrantsUserContext} userContext
     * @returns {Promise<PaymentStrategyResult>}
     */
    async calculatePayment(state, userContext) {
      const [paymentResult, actionGroups] = await Promise.all([
        calculateLandActionsPayment(state, userContext),
        fetchParcelsGroups(state, userContext)
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
    /**
     * @param {WmpState} state
     * @param {LandGrantsUserContext} userContext
     * @returns {Promise<PaymentStrategyResult>}
     */
    async calculatePayment(state, userContext) {
      const { landParcels = [], hectaresUnderTenYearsOld = 0, hectaresTenOrOverYearsOld = 0 } = state
      const { payment, totalPence } = await calculateWmpPayment(
        {
          parcelIds: landParcels,
          hectaresUnderTenYearsOld,
          hectaresTenOrOverYearsOld
        },
        userContext
      )
      return {
        totalPence,
        totalPayment: formatPrice(totalPence),
        payment
      }
    }
  }
}

/**
 * @import { PaymentStrategyResult, MultiActionState, WmpState } from './payment-strategies.d.js'
 * @import { LandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
 */
