import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { mergeAdditionalAnswers } from '~/src/server/common/helpers/state/additional-answers-helper.js'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'

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

        const baseViewModel = this.getViewModel(request, context)
        return h.view(this.viewName, baseViewModel)
      } catch (error) {
        const systemError = new SystemError({
          message: 'Failed to retrieve score results',
          source: 'ScoreResultsController.makeGetRouteHandler',
          reason: 'grants_ui_controller_failure'
        }).from(/** @type {Error} */ (error))
        systemError.logCode = LogCodes.SYSTEM.GENERIC_ERROR
        throw systemError
      }
    }
    return fn
  }
}
