import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import {
  calculateApplicationPayment,
  fetchLandSheetDetails,
  validateLandActions
} from '~/src/server/land-grants/actions/actions.service.js'

export default class LandActionsController extends QuestionPageController {
  viewName = 'actions'
  areaPrefix = 'area-'
  availableActions = []

  /**
   * Extract action details from the form payload
   * @param {object} payload - The form payload
   * @returns {object} - Extracted action data
   */
  extractActionsObjectFromPayload(payload) {
    const areas = {}
    for (const key in payload) {
      if (key.startsWith(this.areaPrefix)) {
        const [, code] = key.split('-')
        const actionInfo = this.availableActions.find((a) => a.code === code)
        areas[code] = {
          value: payload[key],
          unit: actionInfo ? actionInfo.availableArea?.unit : ''
        }
      }
    }
    return areas
  }

  /**
   * Parse land parcel identifier
   * @param {string} landParcel - The land parcel identifier
   * @returns {string[]} - Array containing [sheetId, parcelId]
   */
  parseLandParcelId(landParcel) {
    return (landParcel || '').split('-')
  }

  /**
   * This method is called when there is a POST request to the select land actions page.
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
    const fn = async (request, context, h) => {
      const { state } = context
      const { viewName } = this
      const payload = request.payload ?? {}
      const { actions = '' } = payload
      const [sheetId, parcelId] = this.parseLandParcelId(state.landParcel)
      const actionsObj = this.extractActionsObjectFromPayload(payload)
      const area = []

      Object.entries(actionsObj).forEach(([key, value]) => {
        area.push(`${key}: ${value.value} ${value.unit}.`)
      })

      // Create updated state with the new action data
      const newState = {
        ...state,
        actions,
        area: area.join(', '),
        actionsObj
      }

      if (payload.action === 'validate') {
        const { valid, errorMessages = [] } = await validateLandActions(
          sheetId,
          parcelId,
          actionsObj
        )

        if (valid === false) {
          await this.setState(request, newState)
          return h.view(viewName, {
            ...super.getViewModel(request, context),
            ...newState,
            errors: errorMessages,
            areaPrefix: this.areaPrefix,
            availableActions: this.availableActions
          })
        }
      }

      const applicationPayment = await calculateApplicationPayment(
        sheetId,
        parcelId,
        actionsObj
      )
      const { paymentTotal, errorMessage } = applicationPayment || {}

      await this.setState(request, {
        ...newState,
        errorMessage,
        applicationValue: paymentTotal
      })
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }

  /**
   * This method is called when there is a GET request to the land grants actions page.
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
      const { collection, viewName } = this
      const { state } = context

      const [sheetId, parcelId] = this.parseLandParcelId(state.landParcel)

      // Load available actions for the land parcel
      try {
        const data = await fetchLandSheetDetails(parcelId, sheetId)
        this.availableActions = data.parcel.actions || []
        if (!this.availableActions.length) {
          request.logger.error({
            message: `No actions found for parcel ${sheetId}-${parcelId}`,
            landParcel: state.landParcel
          })
        }
      } catch (error) {
        request.logger.error(
          error,
          `Failed to fetch land parcel data for id ${sheetId}-${parcelId}`
        )
      }

      // Build the view model exactly as in the original code
      const viewModel = {
        ...super.getViewModel(request, context),
        ...state,
        errors: collection.getErrors(collection.getErrors()),
        areaPrefix: this.areaPrefix,
        availableActions: this.availableActions
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
