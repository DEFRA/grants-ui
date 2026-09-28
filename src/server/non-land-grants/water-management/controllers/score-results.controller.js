import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { invokeGrantScoringGetAction } from '~/src/server/common/services/grant-scoring/grant-scoring.service.js'
import { withDerivedState } from '~/src/server/common/helpers/state/with-derived-state.js'

export default class ScoreResultsController extends withDerivedState(QuestionPageController) {
  /**
   * Handle GET requests to the score results page
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
