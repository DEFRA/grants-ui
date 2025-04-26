import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { fetchParcelDataForBusiness } from '~/src/server/common/services/consolidated-view.service.js'

const logger = createLogger()

export default class LandParcelPageController extends QuestionPageController {
  viewName = 'land-parcel'

  makePostRouteHandler() {
    /**
     * Handle POST requests to the land parcel page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick} h
     * @returns {Promise | import('@hapi/hapi').ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const payload = request.payload ?? {}
      const { landParcel } = payload

      await this.setState(request, {
        ...state,
        landParcel
      })
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }

  /**
   * This method is called when there is a GET request to the select land parcel page.
   * It gets the view model for the page using the `getViewModel` method,
   * and then adds business details to the view model
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the land parcel page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick} h
     */
    const fn = async (request, context, h) => {
      const { landParcel = '' } = context.state || {}
      const sbi = 117235001
      const crn = 1100598138
      const { viewName } = this
      const baseViewModel = super.getViewModel(request, context)

      try {
        const response = await fetchParcelDataForBusiness(sbi, crn)
        const business = response.data?.business
        const viewModel = {
          ...baseViewModel,
          business,
          landParcel
        }

        return h.view(viewName, viewModel)
      } catch (error) {
        // Log specific error details based on error type
        if (error.name === 'ConsolidatedViewApiError') {
          logger.error(
            {
              err: error,
              statusCode: error.statusCode,
              sbi,
              crn
            },
            'Consolidated View API error when fetching parcel data'
          )
        } else {
          logger.error(
            {
              err: error,
              sbi,
              crn
            },
            'Unexpected error when fetching parcel data'
          )
        }

        const errorMessage =
          'Unable to find parcel information, please try again later.'

        return h.view(viewName, {
          ...baseViewModel,
          errors: [errorMessage]
        })
      }
    }

    return fn
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
