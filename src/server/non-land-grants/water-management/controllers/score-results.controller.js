import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { mergeAdditionalAnswers } from '~/src/server/common/helpers/state/additional-answers-helper.js'
import { GrantApplicationServiceError } from '~/src/server/common/utils/errors/GrantApplicationServiceError.js'

export default class ScoreResultsController extends QuestionPageController {
  /**
   * Handle GET requests to the score results page
   */
  makeGetRouteHandler() {
    const fn = async (request, context, h) => {
      try {
        // api call example: invokeGasPostAction
        // api param: context.state.cropsGrowing
        // api param: context.state.countyProjectLocated
        const scoreResults = 'Average'
        context.state = await this.setState(request, mergeAdditionalAnswers(context.state, { scoreResults }))

        const baseViewModel = super.getViewModel(request, context)
        return h.view(this.viewName, { ...baseViewModel })
      } catch (error) {
        const grantApplicationServiceError = new GrantApplicationServiceError({
          message: 'Failed to retrieve score results',
          source: 'ScoreResultsController.makeGetRouteHandler',
          reason: 'gas_action_failure',
          grantCode: 'water-management',
          action: 'retrieve-score-results'
        }).from(/** @type {Error} */ (error))
        grantApplicationServiceError.logCode = LogCodes.SYSTEM.GAS_ACTION_ERROR
        throw grantApplicationServiceError
      }
    }
    return fn
  }
}
