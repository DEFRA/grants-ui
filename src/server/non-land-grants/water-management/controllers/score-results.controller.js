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
    const {
      sectorsIrrigated,
      projectLocated__easting: easting,
      projectLocated__northing: northing,
      businessesUsingWater = 'FIVE_OR_MORE',
      planning = 'NN',
      abstraction = 'NN'
    } = state

    const { totalScore, sectorScore, scarcityScore, collaborationScore, planningAbstractionScore } =
      await invokeGrantScoringGetAction('water-management', request, {
        sectorsIrrigated,
        easting,
        northing,
        businessesUsingWater,
        planning,
        abstraction
      })

    return {
      totalScore,
      sectorScore,
      scarcityScore,
      collaborationScore,
      planningAbstractionScore
    }
  }
}
