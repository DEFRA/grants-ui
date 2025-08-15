import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import {
  calculateGrantPayment,
  fetchAvailableActionsForParcel,
  parseLandParcel,
  triggerApiActionsValidation
} from '~/src/server/land-grants/services/land-grants.service.js'
import { sbiStore } from '~/.server/server/sbi/state.js'

import { logger } from '~/src/server/common/helpers/logging/log.js'

const unitRatesForActions = {
  CMOR1: 100,
  UPL1: 200,
  UPL2: 300,
  UPL3: 400,
  UPL4: 500
}

export default class SelectActionsForLandParcelPageController extends QuestionPageController {
  viewName = 'select-actions-for-land-parcel'
  availableActions = []

  processPayloadAction(landAction) {
    const actionInfo = this.availableActions.find((a) => a.code === landAction)

    if (!actionInfo) {
      return {}
    }

    return {
      description: actionInfo.description,
      value: actionInfo?.availableArea?.value ?? '',
      unit: actionInfo?.availableArea?.unit ?? '',
      annualPaymentPence: unitRatesForActions[landAction]
    }
  }

  /**
   * Extract action data from the form payload
   * @param {object} payload - The form payload
   * @returns {object} - Extracted action data
   */
  extractActionsDataFromPayload(payload) {
    const actionsObj = {}
    const { landAction } = payload

    const result = this.processPayloadAction(landAction)
    if (Object.keys(result).length > 0) {
      actionsObj[landAction] = result
    }

    return { actionsObj }
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
      availableActions: this.availableActions
    }
  }

  /**
   * Transforms land parcels data into the format required for payment calculation API
   * @param {object} landParcels - Object containing land parcels data
   * @param {string} sbi - Single Business Identifier
   * @returns {Array} - Array of land actions for API
   */
  prepareLandActionsForPayment(landParcels, sbi) {
    const landActions = []

    // Iterate through each land parcel
    for (const [parcelKey, parcelData] of Object.entries(landParcels)) {
      // Skip parcels without actionsObj
      if (!parcelData?.actionsObj || Object.keys(parcelData.actionsObj).length === 0) {
        continue
      }

      // Extract sheetId and parcelId from the key (format: 'sheetId-parcelId')
      const [sheetId, parcelId] = parcelKey.split('-')

      // Map actions object to the array of actions with code and quantity
      const actions = Object.entries(parcelData.actionsObj).map(([code, actionData]) => ({
        code,
        quantity: parseFloat(actionData.value)
      }))

      // Only add parcels that have actions
      if (actions.length > 0) {
        landActions.push({
          sbi,
          sheetId,
          parcelId,
          actions
        })
      }
    }
    return landActions
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
      const [sheetId, parcelId] = parseLandParcel(state.selectedLandParcel)
      logger.info(
        JSON.stringify({ sheetId, parcelId, selectedLandParcel: state.selectedLandParcel, area: this.availableActions })
      )
      const { actionsObj, selectedActionsQuantities } = this.extractActionsDataFromPayload(payload)
      // Create an updated state with the new action data
      const newState = await this.buildNewState(state, selectedActionsQuantities, actionsObj)

      if (payload.action === 'validate') {
        // logger.info(JSON.stringify({ newState, actionsObj, sheetId, parcelId }))

        const { errors, errorSummary } = await this.validatePayload(request, payload, actionsObj, sheetId, parcelId)
        // logger.info(errors)

        if (Object.keys(errors).length > 0) {
          return h.view(viewName, {
            ...this.getViewModel(request, context),
            ...newState,
            parcelName: `${sheetId} ${parcelId}`,
            errorSummary,
            errors
          })
        }
      }

      await this.setState(request, newState)
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }

  validatePayload = async (request, payload, actionsObj, sheetId, parcelId) => {
    const errors = {}

    if (payload?.landAction?.length === 0) {
      errors.landAction = {
        text: 'Please select one action'
      }
    }

    if (Object.keys(actionsObj).length > 0) {
      logger.info({ sheetId, parcelId, actionsObj })
      const { valid, errorMessages = [] } = await triggerApiActionsValidation({
        sheetId,
        parcelId,
        actionsObj
      })

      if (!valid) {
        for (const apiError of errorMessages) {
          errors[apiError.code] = {
            text: apiError.description
          }
        }
      }
    }

    const errorSummary = Object.entries(errors).map(([, { text }]) => ({
      text,
      href: '#landAction'
    }))

    return { errors, errorSummary }
  }

  buildNewState = async (state, selectedActionsQuantities, actionsObj) => {
    // Add the current actions to the land parcels object
    const updatedLandParcels = {
      ...state.landParcels, // Spread existing land parcels
      [state.selectedLandParcel]: {
        ...state.landParcels?.[state.selectedLandParcel], // Preserve existing parcel data
        actionsObj: {
          ...state.landParcels?.[state.selectedLandParcel]?.actionsObj, // Merge existing actions
          ...actionsObj // Add new actions
        }
      }
    }

    let draftApplicationAnnualTotalPence = state.draftApplicationAnnualTotalPence || 0

    // Get all land actions across all parcels
    const landActions = this.prepareLandActionsForPayment(updatedLandParcels, sbiStore.get('sbi'))

    // Call the API with all land actions
    const paymentDetails = await calculateGrantPayment({
      landActions
    })

    // Update payment information for the current actions object
    if (paymentDetails?.payment?.parcelItems) {
      for (const item of Object.values(paymentDetails.payment.parcelItems)) {
        if (actionsObj[item.code]) {
          updatedLandParcels[`${item.sheetId}-${item.parcelId}`].actionsObj[item.code].annualPaymentPence =
            item.annualPaymentPence
        }
      }

      draftApplicationAnnualTotalPence = paymentDetails.payment.annualTotalPence
    }

    return {
      ...state,
      selectedActionsQuantities,
      draftApplicationAnnualTotalPence,
      landParcels: updatedLandParcels
    }
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

      const [sheetId = '', parcelId = ''] = parseLandParcel(state.selectedLandParcel)

      // Load available actions for the land parcel
      try {
        const data = await fetchAvailableActionsForParcel({ parcelId, sheetId })
        this.availableActions = data.actions || []
        if (!this.availableActions.length) {
          request.logger.error({
            message: `No actions found for parcel ${sheetId}-${parcelId}`,
            selectedLandParcel: state.selectedLandParcel
          })
        }
      } catch (error) {
        this.availableActions = []
        request.logger.error(error, `Failed to fetch land parcel data for id ${sheetId}-${parcelId}`)
      }

      logger.info(JSON.stringify({ sheetId, parcelId, availableActions: this.availableActions }))

      // Build the view model exactly as in the original code
      const viewModel = {
        ...this.getViewModel(request, context),
        ...state,
        parcelName: `${sheetId} ${parcelId}`,
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
