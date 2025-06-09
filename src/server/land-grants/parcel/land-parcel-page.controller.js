import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { fetchParcelDataForBusiness } from '~/src/server/common/services/consolidated-view.service.js'
import { sbiStore } from '~/src/server/sbi/state.js'

const logger = createLogger()

export default class LandParcelPageController extends QuestionPageController {
  viewName = 'land-parcel'
  business = null

  makePostRouteHandler() {
    /**
     * Handle POST requests to the land parcel page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick} h
     * @returns {Promise<void>}
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const payload = request.payload ?? {}
      const { landParcel, action } = payload

      if (action === 'validate' && !landParcel) {
        return h.view(this.viewName, {
          ...super.getViewModel(request, context),
          ...state,
          business: this.business,
          landParcelError: 'Please select a land parcel from the list'
        })
      }

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
      const sbi = sbiStore.get('sbi')

      const { viewName } = this
      const baseViewModel = super.getViewModel(request, context)

      try {
        const response = await fetchParcelDataForBusiness(sbi)
        this.business = response.data?.business
        const viewModel = {
          ...baseViewModel,
          business: this.business,
          landParcel
        }

        return h.view(viewName, viewModel)
      } catch (error) {
        logger.error(
          { err: error, sbi },
          'Unexpected error when fetching parcel data'
        )
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
