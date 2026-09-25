import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { invokeGrantScoringGetAction } from '~/src/server/common/services/grant-scoring/grant-scoring.service.js'
import { GrantScoringServiceError } from '~/src/server/common/utils/errors/GrantScoringServiceError.js'
import { withDerivedState } from '~/src/server/common/helpers/state/with-derived-state.js'

export default class ScoreResultsController extends withDerivedState(QuestionPageController) {
  /**
   * Handle GET requests to the score results page
   */
  makeGetRouteHandler() {
    const fn = async (request, context, h) => {
      try {
        context.state = await this.refreshState(request, context)

        const baseViewModel = this.getViewModel(request, context)
        return h.view(this.viewName, baseViewModel)
      } catch (error) {
        const grantScoringServiceError = new GrantScoringServiceError({
          message: 'Failed to get grant eligibility score result',
          source: 'ScoreResultsController.makeGetRouteHandler',
          reason: 'grant_scoring_action_failure',
          grantCode: 'water-management',
          action: 'get-grant-eligibility-score-result'
        }).from(/** @type {Error} */ (error))
        grantScoringServiceError.logCode = LogCodes.SYSTEM.GRANT_SCORING_SERVICE_ACTION_ERROR
        throw grantScoringServiceError
      }
    }
    return fn
  }

  /**
   * Calculates the derived answers without changing persisted state.
   * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
   * @param {any} state
   * @returns {Promise<Record<string, any>>}
   */
  async getCalculatedAnswers(request, state) {
    const { countyProjectLocated } = state

    const { score: eligibilityScore, band: eligibilityBand } = await invokeGrantScoringGetAction(
      'water-management',
      request,
      { county: countyProjectLocated }
    )

    return { eligibilityScore, eligibilityBand }
  }
}
