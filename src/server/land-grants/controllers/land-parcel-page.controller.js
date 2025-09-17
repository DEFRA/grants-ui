import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { fetchParcels } from '../services/land-grants.service.js'
import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'

const logger = createLogger()

export default class LandParcelPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'select-land-parcel'
  parcels = []

  formatParcelForView = (parcel, actionsForParcel) => {
    const hasArea = parcel.area.value && parcel.area.unit
    const hasActions = actionsForParcel > 0

    let hint = ''
    if (hasArea) {
      hint = `Total size${hasActions ? '' : ':'} ${parcel.area.value} ${parcel.area.unit}`
    }

    if (hasActions) {
      const actionsAddedStr = `${actionsForParcel} action${actionsForParcel > 1 ? 's' : ''} added`
      hint += hasArea ? `, ${actionsAddedStr}` : `${actionsAddedStr}`
    }

    return {
      text: `${parcel.sheetId} ${parcel.parcelId}`,
      value: `${parcel.sheetId}-${parcel.parcelId}`,
      hint
    }
  }

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

      this.selectedLandParcel = selectedLandParcel

      const authResult = await this.performAuthCheck(request, context, h)
      if (authResult) return authResult

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
      const { selectedLandParcel = '', landParcels } = context.state || {}
      const { sbi } = request.auth.credentials

      const { viewName } = this
      const baseViewModel = super.getViewModel(request, context)

      try {
        const parcels = await fetchParcels(sbi)
        this.parcels = parcels.map((parcel) => {
          const parcelKey = `${parcel.sheetId}-${parcel.parcelId}`
          const parcelData = landParcels?.[parcelKey]
          const actionsForParcel = parcelData?.actionsObj ? Object.keys(parcelData.actionsObj).length : 0
          return this.formatParcelForView(parcel, actionsForParcel)
        })

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
