import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { withDerivedState } from '~/src/server/common/helpers/state/with-derived-state.js'

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
      minGrantReached = estimatedMaxGrant >= 35000
    } else {
      // water tanks only, min grant reduced to £15,000
      minGrantReached = estimatedMaxGrant >= 15000
    }

    let maxGrantReached = false
    if (estimatedMaxGrant > 350000) {
      maxGrantReached = true
      estimatedMaxGrant = 350000
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

    if (!costsConfig) {
      log(LogCodes.SYSTEM.CONFIG_MISSING, { missing: ['config.costs'] }, hapiRequest)
      throw new Error('Missing required configuration: config.costs')
    }

    // @ts-ignore
    const {
      reservoirClayHighCostPerUnit,
      reservoirClayLowCostPerUnit,
      reservoirSyntheticHighCostPerUnit,
      reservoirSyntheticLowCostPerUnit,
      distNetworkCostPerUnit,
      tanksCostPerUnit,
      grantMaxRate
    } = costsConfig

    if (
      reservoirClayHighCostPerUnit === undefined ||
      reservoirClayLowCostPerUnit === undefined ||
      reservoirSyntheticHighCostPerUnit === undefined ||
      reservoirSyntheticLowCostPerUnit === undefined ||
      distNetworkCostPerUnit === undefined ||
      tanksCostPerUnit === undefined ||
      grantMaxRate === undefined
    ) {
      const missing = []
      if (reservoirClayHighCostPerUnit === undefined) {
        missing.push('config.costs.reservoirClayHighCostPerUnit')
      }
      if (reservoirClayLowCostPerUnit === undefined) {
        missing.push('config.costs.reservoirClayLowCostPerUnit')
      }
      if (reservoirSyntheticHighCostPerUnit === undefined) {
        missing.push('config.costs.reservoirSyntheticHighCostPerUnit')
      }
      if (reservoirSyntheticLowCostPerUnit === undefined) {
        missing.push('config.costs.reservoirSyntheticLowCostPerUnit')
      }
      if (distNetworkCostPerUnit === undefined) {
        missing.push('config.costs.distNetworkCostPerUnit')
      }
      if (tanksCostPerUnit === undefined) {
        missing.push('config.costs.tanksCostPerUnit')
      }
      if (grantMaxRate === undefined) {
        missing.push('config.costs.grantMaxRate')
      }
      log(LogCodes.SYSTEM.CONFIG_MISSING, { missing }, hapiRequest)
      throw new Error(`Missing required configuration: ${missing.join(', ')}`)
    }

    return {
      reservoirClayHighCostPerUnit,
      reservoirClayLowCostPerUnit,
      reservoirSyntheticHighCostPerUnit,
      reservoirSyntheticLowCostPerUnit,
      distNetworkCostPerUnit,
      tanksCostPerUnit,
      grantMaxRate
    }
  }
}
