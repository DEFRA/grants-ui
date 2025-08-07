import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { sbiStore } from '~/src/server/sbi/state.js'
import { fetchParcels } from '../services/land-grants.service.js'

const logger = createLogger()

export default class LandParcelPageController extends QuestionPageController {
  viewName = 'select-land-parcel'
  parcels = []

  formatParcelForView = (parcel) => ({
    text: `${parcel.sheetId} ${parcel.parcelId}`,
    value: `${parcel.sheetId}-${parcel.parcelId}`,
    hint: parcel.area.value && parcel.area.unit ? `Total size: ${parcel.area.value} ${parcel.area.unit}` : undefined
  })

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
      const { selectedLandParcel, action } = payload

      if (action === 'validate' && !selectedLandParcel) {
        return h.view(this.viewName, {
          ...super.getViewModel(request, context),
          ...state,
          parcels: this.parcels,
          errorMessage: 'Please select a land parcel from the list'
        })
      }

      await this.setState(request, {
        ...state,
        selectedLandParcel
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
      const { selectedLandParcel = '' } = context.state || {}
      const sbi = sbiStore.get('sbi')

      const { viewName } = this
      const baseViewModel = super.getViewModel(request, context)

      try {
        const parcels = await fetchParcels(sbi)
        this.parcels = parcels.map(this.formatParcelForView)

        const viewModel = {
          ...baseViewModel,
          parcels: this.parcels,
          selectedLandParcel
        }

        return h.view(viewName, viewModel)
      } catch (error) {
        logger.error({ err: error, sbi }, 'Unexpected error when fetching parcel data')
        const errorMessage = 'Unable to find parcel information, please try again later.'

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
