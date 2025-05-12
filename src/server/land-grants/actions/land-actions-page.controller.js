import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import {
  calculateApplicationPayment,
  fetchLandSheetDetails,
  validateLandActions
} from '~/src/server/land-grants/actions/land-actions.service.js'

export default class LandActionsPageController extends QuestionPageController {
  viewName = 'land-actions'
  quantityPrefix = 'qty-'
  availableActions = []

  /**
   * Extract action details from the form payload
   * @param {object} payload - The form payload
   * @returns {object} - Extracted action data
   */
  extractActionsObjectFromPayload(payload) {
    const areas = {}
    const { actions = [] } = payload

    for (const key in payload) {
      if (key.startsWith(this.quantityPrefix)) {
        const [, code] = key.split('-')
        const actionInfo = this.availableActions.find((a) => a.code === code)
        if (!actions.includes(code) || !payload[key] || !actionInfo) {
          continue
        }
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
   * Transform actions object for view
   * @param {object} actionsObj - The actions object
   * @param {object} actionsObj.value - The action value
   * @param {string} actionsObj.unit - The action unit
   * @returns {string} - Formatted string for view
   */
  transformActionsForView(actionsObj) {
    const actions = []
    Object.entries(actionsObj).forEach(([key, value]) => {
      actions.push(`${key}: ${value.value} ${value.unit}.`)
    })
    return actions.join(' - ')
  }

  /**
   * This method is called to get the view model for the page.
   * It adds the area prefix and available actions to the view model.
   * @param {FormRequest} request - The request object
   * @param {FormContext} context - The form context
   * @returns {object} - The view model for the page
   */
  getViewModel(request, context) {
    return {
      ...super.getViewModel(request, context),
      quantityPrefix: this.quantityPrefix,
      availableActions: this.availableActions
    }
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
      const [sheetId, parcelId] = this.parseLandParcelId(state.landParcel)
      const actionsObj = this.extractActionsObjectFromPayload(payload)

      // Create updated state with the new action data
      const newState = {
        ...state,
        actions: this.transformActionsForView(actionsObj),
        actionsObj
      }

      if (payload.action === 'validate') {
        let errors = []
        if (Object.keys(actionsObj).length === 0) {
          errors.push('Please select at least one action and quantity')
        } else {
          const { valid, errorMessages = [] } = await validateLandActions(
            sheetId,
            parcelId,
            actionsObj
          )

          if (!valid) {
            errors = errorMessages.map((m) => m.description)
          }
        }

        if (errors.length > 0) {
          await this.setState(request, newState)
          return h.view(viewName, {
            ...this.getViewModel(request, context),
            ...newState,
            errors
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
        ...this.getViewModel(request, context),
        ...state,
        errors: collection.getErrors(collection.getErrors())
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
