import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { mergeAdditionalAnswers } from '~/src/server/common/helpers/state/additional-answers-helper.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

export default class TotalEstimatedCostController extends QuestionPageController {
  /**
   * Handle GET requests to the total estimated cost page
   */
  makeGetRouteHandler() {
    const fn = async (request, context, h) => {
      try {
        const { reservoirCostPerUnit, distNetworkCostPerUnit, tanksCostPerUnit } = this.validatePageConfig(request)
        const {
          itemsPlanningToInstall,
          howMuchWater = 0,
          waterDistributionLength = 0,
          waterStorageCapacity = 0
        } = context.state

        const reservoirCost = itemsPlanningToInstall.includes('RESERVOIR') ? reservoirCostPerUnit * howMuchWater : 0
        const waterDistributionNetworkCost = itemsPlanningToInstall.includes('WATER_DISTRIBUTION_NETWORK')
          ? distNetworkCostPerUnit * waterDistributionLength
          : 0
        const waterTanksCost = itemsPlanningToInstall.includes('WATER_STORAGE_TANKS')
          ? tanksCostPerUnit * waterStorageCapacity
          : 0
        const totalEstimatedCost = reservoirCost + waterDistributionNetworkCost + waterTanksCost
        const estimatedCostFortyPercent = totalEstimatedCost * 0.4

        context.state = await this.setState(
          request,
          mergeAdditionalAnswers(context.state, {
            reservoirCostPerUnit,
            distNetworkCostPerUnit,
            tanksCostPerUnit,
            reservoirCost,
            waterDistributionNetworkCost,
            waterTanksCost,
            totalEstimatedCost,
            estimatedCostFortyPercent
          })
        )

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
   * Validates the costs configuration in the form metadata.
   * @param {import('@hapi/hapi').Request} request
   * @returns {{reservoirCostPerUnit: number, distNetworkCostPerUnit: number, tanksCostPerUnit: number}}
   * @private
   */
  validatePageConfig(request) {
    const costsConfig = request.app.model?.def?.metadata?.totalEstimatedCostsPage

    if (!costsConfig) {
      log(LogCodes.SYSTEM.CONFIG_MISSING, { missing: ['metadata.totalEstimatedCostsPage'] }, request)
      throw new Error('Missing required configuration: metadata.totalEstimatedCostsPage')
    }

    // @ts-ignore
    const { reservoirCostPerUnit, distNetworkCostPerUnit, tanksCostPerUnit } = costsConfig

    if (reservoirCostPerUnit === undefined || distNetworkCostPerUnit === undefined || tanksCostPerUnit === undefined) {
      const missing = []
      if (reservoirCostPerUnit === undefined) {
        missing.push('metadata.totalEstimatedCostsPage.reservoirCostPerUnit')
      }
      if (distNetworkCostPerUnit === undefined) {
        missing.push('metadata.totalEstimatedCostsPage.distNetworkCostPerUnit')
      }
      if (tanksCostPerUnit === undefined) {
        missing.push('metadata.totalEstimatedCostsPage.tanksCostPerUnit')
      }
      log(LogCodes.SYSTEM.CONFIG_MISSING, { missing }, request)
      throw new Error(`Missing required configuration: ${missing.join(', ')}`)
    }

    return { reservoirCostPerUnit, distNetworkCostPerUnit, tanksCostPerUnit }
  }
}
