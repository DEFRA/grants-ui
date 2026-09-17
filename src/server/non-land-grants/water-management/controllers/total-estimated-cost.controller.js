import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { mergeAdditionalAnswers } from '~/src/server/common/helpers/state/additional-answers-helper.js'
import { GrantApplicationServiceError } from '~/src/server/common/utils/errors/GrantApplicationServiceError.js'

export default class TotalEstimatedCostController extends QuestionPageController {
  /**
   * Handle GET requests to the total estimated cost page
   */
  makeGetRouteHandler() {
    const fn = async (request, context, h) => {
      try {
        const reservoirCostPerUnit =
          h.request.app?.model?.def?.metadata?.totalEstimatedCostsPage?.reservoirCostPerUnit ?? 2.5
        const distNetworkCostPerUnit =
          h.request.app?.model?.def?.metadata?.totalEstimatedCostsPage?.distNetworkCostPerUnit ?? 5
        const tanksCostPerUnit = h.request.app?.model?.def?.metadata?.totalEstimatedCostsPage?.tanksCostPerUnit ?? 1.5
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

        context.state = await this.setState(
          request,
          mergeAdditionalAnswers(context.state, {
            reservoirCostPerUnit,
            distNetworkCostPerUnit,
            tanksCostPerUnit,
            reservoirCost,
            waterDistributionNetworkCost,
            waterTanksCost,
            totalEstimatedCost
          })
        )

        const baseViewModel = super.getViewModel(request, context)
        return h.view(this.viewName, { ...baseViewModel })
      } catch (error) {
        const grantApplicationServiceError = new GrantApplicationServiceError({
          message: 'Failed to calculate total estimated cost',
          source: 'TotalEstimatedCostController.makeGetRouteHandler',
          reason: 'grants_ui_controller_failure',
          grantCode: 'water-management',
          action: 'calculate-total-estimated-cost'
        }).from(/** @type {Error} */ (error))
        grantApplicationServiceError.logCode = LogCodes.SYSTEM.GENERIC_ERROR
        throw grantApplicationServiceError
      }
    }
    return fn
  }
}
