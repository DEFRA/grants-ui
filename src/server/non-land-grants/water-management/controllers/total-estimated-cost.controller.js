import Joi from 'joi'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { withDerivedState } from '~/src/server/common/helpers/state/with-derived-state.js'

const required = Joi.any().required()
const costsSchema = Joi.object({
  reservoirClayHighCostPerUnit: required,
  reservoirClayLowCostPerUnit: required,
  reservoirSyntheticHighCostPerUnit: required,
  reservoirSyntheticLowCostPerUnit: required,
  distNetworkCostPerUnit: required,
  tanksCostPerUnit: required,
  grantMaxRate: required
})
  .unknown(true)
  .required()

export default class TotalEstimatedCostController extends withDerivedState(QuestionPageController) {
  /**
   * Handle GET requests to the total estimated cost page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      context.state = await this.refreshState(request, context)

      const baseViewModel = this.getViewModel(request, context)
      return h.view(this.viewName, baseViewModel)
    }
  }

  /**
   * Override getNextPath to redirect to exit page when minimum grant amount not reached
   * @param context
   * @returns {*}
   */
  getNextPath(context) {
    const minGrantReached = context.state.additionalAnswers.minGrantReached
    return minGrantReached ? super.getNextPath(context) : '/exit-total-estimated-cost'
  }

  /**
   * Calculates the derived answers without changing persisted state.
   * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
   * @param {any} state
   * @returns {Record<string, any>}
   */
  getCalculatedAnswers(request, state) {
    const {
      reservoirClayHighCostPerUnit,
      reservoirClayLowCostPerUnit,
      reservoirSyntheticHighCostPerUnit,
      reservoirSyntheticLowCostPerUnit,
      distNetworkCostPerUnit,
      tanksCostPerUnit,
      grantMaxRate
    } = this.validatePageConfig(request)

    const {
      itemsPlanningToInstall = [],
      reservoirLining,
      howMuchWater = 0,
      waterDistributionLength = 0,
      waterStorageCapacity = 0
    } = state

    let reservoirCost = 0
    let reservoirHighCostPerUnit = reservoirClayHighCostPerUnit
    let reservoirLowCostPerUnit = reservoirClayLowCostPerUnit
    if (itemsPlanningToInstall.includes('RESERVOIR')) {
      if (reservoirLining === 'synthetic') {
        reservoirHighCostPerUnit = reservoirSyntheticHighCostPerUnit
        reservoirLowCostPerUnit = reservoirSyntheticLowCostPerUnit
      }
      if (howMuchWater > 10000) {
        reservoirCost = reservoirHighCostPerUnit * 10000 + reservoirLowCostPerUnit * (howMuchWater - 10000)
      } else {
        reservoirCost = reservoirHighCostPerUnit * howMuchWater
      }
    }

    const waterDistributionNetworkCost = itemsPlanningToInstall.includes('WATER_DISTRIBUTION_NETWORK')
      ? distNetworkCostPerUnit * waterDistributionLength
      : 0

    const waterTanksCost = itemsPlanningToInstall.includes('WATER_STORAGE_TANKS')
      ? tanksCostPerUnit * waterStorageCapacity
      : 0

    const totalEstimatedCost = reservoirCost + waterDistributionNetworkCost + waterTanksCost

    let estimatedMaxGrant = totalEstimatedCost * grantMaxRate
    const estimatedMaxGrantBeforeReduction = estimatedMaxGrant

    let minGrantReached
    if (reservoirCost > 0 || waterDistributionNetworkCost > 0) {
      const MIN_GRANT = 35000
      minGrantReached = estimatedMaxGrant >= MIN_GRANT
    } else {
      // water tanks only, min grant reduced to £15,000
      const MIN_GRANT_TANKS_ONLY = 15000
      minGrantReached = estimatedMaxGrant >= MIN_GRANT_TANKS_ONLY
    }

    let maxGrantReached = false
    const MAX_GRANT = 300000
    if (estimatedMaxGrant > MAX_GRANT) {
      maxGrantReached = true
      estimatedMaxGrant = MAX_GRANT
    }

    return {
      reservoirHighCostPerUnit,
      reservoirLowCostPerUnit,
      distNetworkCostPerUnit,
      tanksCostPerUnit,
      reservoirCost,
      waterDistributionNetworkCost,
      waterTanksCost,
      totalEstimatedCost,
      estimatedMaxGrantBeforeReduction,
      estimatedMaxGrant,
      minGrantReached,
      maxGrantReached
    }
  }

  /**
   * Validates the costs configuration in the form metadata.
   * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
   * @returns {{reservoirClayHighCostPerUnit: number, reservoirClayLowCostPerUnit: number, reservoirSyntheticHighCostPerUnit: number, reservoirSyntheticLowCostPerUnit: number, distNetworkCostPerUnit: number, tanksCostPerUnit: number, grantMaxRate: number}}
   * @private
   */
  validatePageConfig(request) {
    const costsConfig = request.app.model?.def?.metadata?.pageConfig?.[this.path]?.costs
    const hapiRequest = /** @type {import('@hapi/hapi').Request} */ (/** @type {unknown} */ (request))

    // Report every missing or invalid cost unit at once rather than the first one.
    const { error, value } = costsSchema.validate(costsConfig, { abortEarly: false })
    if (error) {
      const missing = error.details.map(({ path }) => ['config.costs', ...path].join('.'))
      log(LogCodes.SYSTEM.CONFIG_MISSING, { missing }, hapiRequest)
      throw new Error(`Missing required configuration: ${missing.join(', ')}`)
    }

    return value
  }
}
