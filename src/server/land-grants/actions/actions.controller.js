import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { fetchLandSheetDetails } from '~/src/server/land-grants/services/land-grants.service.js'

export default class LandActionsController extends QuestionPageController {
  viewName = 'actions'
  areaPrefix = 'area-'

  extractAreasForActions(payload) {
    const areas = {}
    for (const key in payload) {
      if (key.startsWith(this.areaPrefix)) {
        const [, code] = key.split('-')
        areas[code] = payload[key]
      }
    }
    return areas
  }

  /**
   * This method is called when there is a POST request to the select land actions page.
   * It gets the land parcel id and redirects to the next step in the journey.,
   */

  makePostRouteHandler() {
    /**
     * Handle GET requests to the score page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<import('@hapi/boom').Boom<any> | import('@hapi/hapi').ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const payload = request.payload ?? {}
      const { actions = '' } = payload

      const areaObj = this.extractAreasForActions(payload)
      await this.setState(request, {
        ...state,
        actions,
        area: JSON.stringify(areaObj),
        areaObj,
        applicationValue: '£16,467.49' // TODO: This calculation will come from Land Grants API
      })
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }

  /**
   * This method is called when there is a GET request to the land grants actions page.
   * It gets the view model for the page using the `getViewModel` method,
   * and then adds business details to the view model
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the score page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     */
    const fn = async (request, context, h) => {
      const { collection, viewName } = this
      const { state } = context

      const [sheetId, parcelId] = (state.landParcel || '').split('-')

      let actions = []

      try {
        const data = await fetchLandSheetDetails(parcelId, sheetId)
        actions = data.parcel.actions || []
        if (!actions.length) {
          request.logger.error({
            message: `No actions found for parcel ${sheetId}-${parcelId}`,
            landParcel: state.landParcel
          })
        }
      } catch (error) {}

      const viewModel = {
        ...super.getViewModel(request, context),
        ...state,
        errors: collection.getErrors(collection.getErrors()),
        landParcel: state.landParcel,
        areaPrefix: this.areaPrefix,
        availableActions: actions
      }

      return h.view(viewName, viewModel)
    }

    return fn
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
