import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { parseLandParcel } from '../services/land-grants.service.js'

export default class RemoveActionPageController extends QuestionPageController {
  viewName = 'remove-action'
  parcel = ''
  actionDescription = ''
  code = ''

  deleteActionFromState(state, code, parcel) {
    const newState = { ...state }
    delete newState.landParcels[parcel].actionsObj[code]
    if (Object.keys(newState.landParcels[parcel].actionsObj).length === 0) {
      delete newState.landParcels[parcel]
    }
    return newState
  }

  /**
   * This method is called when there is a POST request on the check selected land actions page.
   * It gets the land parcel id and redirects to the next step in the journey.
   */
  makePostRouteHandler() {
    /**
     * Handle POST requests to the page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<import('@hapi/boom').Boom<any> | import('@hapi/hapi').ResponseObject>}
     */
    const fn = (request, context, h) => {
      const { state } = context
      const payload = request.payload ?? {}
      const { removeAction } = payload

      if (removeAction === undefined) {
        return h.view(this.viewName, {
          ...this.getViewModel(request, context),
          parcel: this.parcel,
          actionDescription: this.actionDescription,
          errorMessage: 'Please select if you want to remove the action'
        })
      } else if (removeAction === 'true') {
        const newState = { ...state }
        delete newState.landParcels[this.parcel].actionsObj[this.code]
        if (Object.keys(newState.landParcels[this.parcel].actionsObj).length === 0) {
          delete newState.landParcels[this.parcel]
          this.setState(request, newState)
          return this.proceed(request, h, `/select-actions-for-land-parcel?parcel=${this.parcel}`)
        }
      }

      return this.proceed(request, h, '/check-selected-land-actions')
    }

    return fn
  }

  /**
   * This method is called when there is a GET request to the check selected land actions page.
   * It gets the view model for the page and adds business details
   */
  makeGetRouteHandler() {
    /**
     * Handle GET requests to the page.
     * @param {FormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     */
    const fn = async (request, context, h) => {
      const { viewName } = this
      const { state: { landParcels } } = context
      const [sheetId = '', parcelId = ''] = parseLandParcel(request.query.parcel)
      const code = request.query.code
      const landParcel = landParcels[sheetId + '-' + parcelId]
      const actionInfo = landParcel ? landParcel.actionsObj[code] : null

      if (!landParcel || !actionInfo)
        return this.proceed(request, h, '/check-selected-land-actions')

      this.code = code
      this.parcel = request.query.parcel
      this.actionDescription = actionInfo.description

      return h.view(viewName, {
        ...this.getViewModel(request, context),
        parcel: this.parcel,
        actionDescription: this.actionDescription,
      })
    }

    return fn
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */