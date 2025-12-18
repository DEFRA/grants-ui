import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { fetchParcels } from '../services/land-grants.service.js'
import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { mapParcelsToViewModel } from '~/src/server/land-grants/view-models/parcel.view-model.js'

export default class SelectLandParcelPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'select-land-parcel'

  makePostRouteHandler() {
    /**
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const payload = request.payload ?? {}
      const { selectedLandParcel, action } = payload
      const existingLandParcels = Object.keys(state.landParcels || {}).length > 0

      if (action === 'validate' && !selectedLandParcel) {
        let parcels = []
        try {
          const fetchedParcels = await fetchParcels(request)
          const { landParcels } = state || {}
          parcels = mapParcelsToViewModel(fetchedParcels, landParcels)
        } catch (error) {
          log(
            { level: 'error', error, messageFunc: () => 'Error fetching parcels for validation error rendering' },
            {},
            request
          )
        }

        return h.view(this.viewName, {
          ...super.getViewModel(request, context),
          ...state,
          parcels,
          existingLandParcels,
          errors: 'Select a land parcel'
        })
      }

      const authResult = await this.performAuthCheck(request, h, selectedLandParcel)
      if (authResult) {
        return authResult
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
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const { landParcels } = state || {}
      const sbi = request.auth?.credentials?.sbi

      const { viewName } = this
      const baseViewModel = super.getViewModel(request, context)
      const existingLandParcels = Object.keys(landParcels || {}).length > 0

      try {
        const fetchedParcels = await fetchParcels(request)
        const parcels = mapParcelsToViewModel(fetchedParcels, landParcels)

        if (!parcels?.length) {
          log(LogCodes.LAND_GRANTS.NO_LAND_PARCELS_FOUND, { sbi })

          const errorMessage =
            'Unable to find parcel information, please try again later or contact the Rural Payments Agency.'

          return h.view(viewName, {
            ...baseViewModel,
            parcels: [],
            existingLandParcels,
            errors: [errorMessage]
          })
        }

        const viewModel = {
          ...baseViewModel,
          parcels,
          existingLandParcels
        }

        await this.setState(request, {
          ...state,
          selectedLandParcel: null
        })
        return h.view(viewName, viewModel)
      } catch (error) {
        log({ level: 'error', error, messageFunc: () => `Unexpected error when fetching parcel data` }, {}, request)
        const errorMessage =
          'Unable to find parcel information, please try again later or contact the Rural Payments Agency.'

        return h.view(viewName, {
          ...baseViewModel,
          existingLandParcels,
          errors: [errorMessage]
        })
      }
    }

    return fn
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
