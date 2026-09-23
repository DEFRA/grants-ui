import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { mergeAdditionalAnswers } from '~/src/server/common/helpers/state/additional-answers-helper.js'
import { invokeGrantScoringGetAction } from '~/src/server/common/services/grant-scoring/grant-scoring.service.js'
import { GrantScoringServiceError } from '~/src/server/common/utils/errors/GrantScoringServiceError.js'

export default class ScoreResultsController extends QuestionPageController {
  /**
   * Handle GET requests to the score results page
   */
  makeGetRouteHandler() {
    const grantCode = 'water-management'

    const fn = async (request, context, h) => {
      try {
        const queryParams = { county: context.state.countyProjectLocated }

        const { score: eligibilityScore, band: eligibilityBand } = await invokeGrantScoringGetAction(
          grantCode,
          request,
          queryParams
        )

        context.state = await this.setState(
          request,
          mergeAdditionalAnswers(context.state, { eligibilityScore, eligibilityBand })
        )

        const baseViewModel = this.getViewModel(request, context)
        return h.view(this.viewName, baseViewModel)
      } catch (error) {
        const grantScoringServiceError = new GrantScoringServiceError({
          message: 'Failed to get grant eligibility score result',
          source: 'ScoreResultsController.makeGetRouteHandler',
          reason: 'grant_scoring_action_failure',
          grantCode,
          action: 'get-grant-eligibility-score-result'
        }).from(/** @type {Error} */ (error))
        grantScoringServiceError.logCode = LogCodes.SYSTEM.GRANT_SCORING_SERVICE_ACTION_ERROR
        throw grantScoringServiceError
      }
    }
    return fn
  }
}
