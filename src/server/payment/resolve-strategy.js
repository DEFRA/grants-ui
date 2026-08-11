import { paymentStrategies } from '~/src/server/payment/payment-strategies.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

/**
 * Resolve a payment strategy by the `paymentStrategy` key configured on a page.
 *
 * Shared by the controllers that drive payment behaviour from form-definition
 * config (e.g. `PaymentPageController`, `StartClaimPageController`) so the
 * lookup and "unknown strategy" error handling stays consistent.
 * @param {string | undefined} paymentStrategy
 * @returns {{ calculatePayment: (paymentContext: object, userContext: LandGrantsUserContext) => Promise<PaymentStrategyResult> }}
 */
export function resolveStrategy(paymentStrategy) {
  const strategy = paymentStrategy ? paymentStrategies[paymentStrategy] : undefined
  if (!strategy) {
    throw new SystemError({
      message: `Unknown paymentStrategy "${paymentStrategy}". Available strategies: ${Object.keys(paymentStrategies).join(', ')}`,
      source: 'PaymentPageController',
      reason: 'invalid_config'
    })
  }
  return strategy
}

/**
 * @import { PaymentStrategyResult } from './payment-strategies.d.js'
 * @import { LandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'
 */
