// @ts-nocheck - noImplicitAny debt, remove when this file is typed
import {
  calculateLandActionsPayment,
  fetchParcelsGroups
} from '~/src/server/land-grants/services/land-grants.service.js'
import { calculateWmpPayment, calculateWmpPaymentByTotalArea } from '~/src/server/woodland/woodland.service.js'
import {
  mapPaymentInfoToParcelItems,
  mapAdditionalYearlyPayments
} from '~/src/server/land-grants/view-models/payment.view-model.js'
import { formatPrice } from '~/src/server/common/utils/payment.js'

/**
 * Registry of payment strategies keyed by name.
 * Referenced from the form definition YAML via `config.paymentStrategy`.
 *
 * Each strategy exposes a single `calculatePayment(paymentContext, userContext)` method that returns:
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
/** @type {Record<string, { calculatePayment: (paymentContext: object, userContext: LandGrantsUserContext) => Promise<PaymentStrategyResult> }>} */
export const paymentStrategies = {
  multiAction: {
    /**
     * @param {MultiActionState} paymentContext
     * @param {LandGrantsUserContext} userContext
     * @returns {Promise<PaymentStrategyResult>}
     */
    async calculatePayment(paymentContext, userContext) {
      const [paymentResult, actionGroups] = await Promise.all([
        calculateLandActionsPayment(paymentContext, userContext),
        fetchParcelsGroups(paymentContext, userContext)
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
     * @param {WmpState} paymentContext
     * @param {LandGrantsUserContext} userContext
     * @returns {Promise<PaymentStrategyResult>}
     */
    async calculatePayment(paymentContext, userContext) {
      const { landParcels = [], hectaresUnderTenYearsOld = 0, hectaresTenOrOverYearsOld = 0 } = paymentContext
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
  },

  'woodland-claim': {
    /**
     * @param {WoodlandClaimPaymentContext} paymentContext
     * @param {LandGrantsUserContext} userContext
     * @returns {Promise<PaymentStrategyResult>}
     */
    async calculatePayment(paymentContext, userContext) {
      const { totalAreaHa, applicationId, sbi, crn } = paymentContext
      const { payment, totalPence } = await calculateWmpPaymentByTotalArea(
        {
          totalAreaHa,
          applicationId,
          sbi,
          crn
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
 * @import { PaymentStrategyResult, MultiActionState, WmpState, WoodlandClaimPaymentContext } from './payment-strategies.d.js'
 * @import { LandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
 */
