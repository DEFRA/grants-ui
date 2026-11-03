import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { invokeGrantScoringGetAction } from '~/src/server/common/services/grant-scoring/grant-scoring.service.js'
import { mergeAdditionalAnswers } from '~/src/server/common/helpers/state/additional-answers-helper.js'

export default class LocationValidateController extends QuestionPageController {
  /**
   * Override getNextPath to redirect to the exit page when the location is not found
   * @param context
   * @returns {*}
   */
  getNextPath(context) {
    const locationFound = context.state.additionalAnswers?.locationFound
    return locationFound ? super.getNextPath(context) : '/exit-where-project-located'
  }

  makePostRouteHandler() {
    return async (request, context, h) => {
      const { projectLocated__easting: easting, projectLocated__northing: northing } = request.payload ?? {}

      let locationFound
      try {
        await invokeGrantScoringGetAction('validate/location', 'water-management', { easting, northing })
        locationFound = true
      } catch (error) {
        const validateLocationStatus = error._details?.upstreamStatus
        if (validateLocationStatus === statusCodes.badRequest) {
          locationFound = false
        } else {
          throw error
        }
      }

      await this.setState(request, mergeAdditionalAnswers(context.state, { locationFound }))

      return this.proceed(request, h, this.getNextPath(context))
    }
  }
}
