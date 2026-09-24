import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { withDerivedState } from '~/src/server/common/helpers/state/with-derived-state.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

export default class TotalEstimatedCostController extends withDerivedState(QuestionPageController) {
  /**
   * Handle GET requests to the total estimated cost page
   */
  makeGetRouteHandler() {
    const fn = async (request, context, h) => {
      try {
        context.state = await this.refreshState(request, context)

        const baseViewModel = this.getViewModel(request, context)
        return h.view(this.viewName, baseViewModel)
      } catch (error) {
        const systemError = new SystemError({
          message: 'Failed to calculate total estimated cost',
          source: 'TotalEstimatedCostController.makeGetRouteHandler',
          reason: 'grants_ui_controller_failure'
        }).from(/** @type {Error} */ (error))
        systemError.logCode = LogCodes.SYSTEM.GENERIC_ERROR
        throw systemError
      }
    }
    return fn
  }

  /**
   * Calculates the derived answers without changing persisted state.
   * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
   * @param {any} state
   * @returns {Record<string, number>}
   */
  getCalculatedAnswers(request, state) {
    const { reservoirCostPerUnit, distNetworkCostPerUnit, tanksCostPerUnit, grantMaxRate } =
      this.validatePageConfig(request)
    const {
      itemsPlanningToInstall = [],
      howMuchWater = 0,
      waterDistributionLength = 0,
      waterStorageCapacity = 0
    } = state

    const reservoirCost = itemsPlanningToInstall.includes('RESERVOIR') ? reservoirCostPerUnit * howMuchWater : 0
    const waterDistributionNetworkCost = itemsPlanningToInstall.includes('WATER_DISTRIBUTION_NETWORK')
      ? distNetworkCostPerUnit * waterDistributionLength
      : 0
    const waterTanksCost = itemsPlanningToInstall.includes('WATER_STORAGE_TANKS')
      ? tanksCostPerUnit * waterStorageCapacity
      : 0
    const totalEstimatedCost = reservoirCost + waterDistributionNetworkCost + waterTanksCost

    return {
      reservoirCostPerUnit,
      distNetworkCostPerUnit,
      tanksCostPerUnit,
      reservoirCost,
      waterDistributionNetworkCost,
      waterTanksCost,
      totalEstimatedCost,
      estimatedMaxGrant: totalEstimatedCost * grantMaxRate
    }
  }

  /**
   * Validates the costs configuration in the form metadata.
   * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
   * @returns {{reservoirCostPerUnit: number, distNetworkCostPerUnit: number, tanksCostPerUnit: number, grantMaxRate: number}}
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
    const { reservoirCostPerUnit, distNetworkCostPerUnit, tanksCostPerUnit, grantMaxRate } = costsConfig

    if (
      reservoirCostPerUnit === undefined ||
      distNetworkCostPerUnit === undefined ||
      tanksCostPerUnit === undefined ||
      grantMaxRate === undefined
    ) {
      const missing = []
      if (reservoirCostPerUnit === undefined) {
        missing.push('config.costs.reservoirCostPerUnit')
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

    return { reservoirCostPerUnit, distNetworkCostPerUnit, tanksCostPerUnit, grantMaxRate }
  }
}
