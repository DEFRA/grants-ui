import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import {
  calculateGrantPayment,
  fetchAvailableActionsForParcel,
  parseLandParcel,
  triggerApiActionsValidation
} from '~/src/server/land-grants/services/land-grants.service.js'
import { sbiStore } from '~/.server/server/sbi/state.js'

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

  /**
   * Extract action data from the form payload
   * @param {object} payload - The form payload
   * @returns {object} - Extracted action data
   */
  extractActionsDataFromPayload(payload) {
    const actionsObj = {}
    const { landAction } = payload
    let result = {}

    const actionInfo = this.availableActions.find((a) => a.code === landAction) || {}

    if (Object.keys(actionInfo).length > 0) {
      result = {
        description: actionInfo.description,
        value: actionInfo?.availableArea?.value ?? '',
        unit: actionInfo?.availableArea?.unit ?? '',
        annualPaymentPence: unitRatesForActions[landAction]
      }
      actionsObj[landAction] = result
    }

    return { actionsObj }
  }

  /** Map actions for radio buttons */
  mapActionToViewModel(action) {
    return {
      value: action.code,
      text: action.description,
      hint: {
        text:
          `Payment rate per year: £${action.ratePerUnitGbp} per ha` +
          (action.ratePerAgreementPerYearGbp ? ` and £${action.ratePerAgreementPerYearGbp} per agreement` : '')
      }
    }
  }

  /**
   * This method is called to get the view model for the page.
   * It adds the area prefix and available actions to the view model.
   * @param {FormRequest} request - The request object
   * @param {FormContext} context - The form context
   * @returns {object} - The view model for the page
   */
  getViewModel(request, context) {
    const assessMoorlandArea = this.availableActions.find((a) => a.code === 'CMOR1')?.availableArea?.value
    const livestockGrazingAreas = this.availableActions
      .filter((a) => a.code !== 'CMOR1')
      .map((a) => a.availableArea?.value)

    const livestockGrazingArea = livestockGrazingAreas.length > 0 ? Math.max(...livestockGrazingAreas) : 0

    const assessMoorlandAction = this.availableActions
      .filter((a) => a.code === 'CMOR1')
      .map((a) => this.mapActionToViewModel(a))
    const displayActions = this.availableActions
      .filter((a) => a.code !== 'CMOR1')
      .map((a) => this.mapActionToViewModel(a))

    return {
      ...super.getViewModel(request, context),
      availableActions: this.availableActions,
      assessMoorlandArea: assessMoorlandArea || 0,
      livestockGrazingArea,
      assessMoorlandAction,
      displayActions
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
      const landAction = payload.landAction ?? ''
      const [sheetId, parcelId] = parseLandParcel(state.selectedLandParcel)
      const validateUserInput = this.validateUserInput(landAction)

      // Validate user input
      if (validateUserInput?.errors?.landAction) {
        return h.view(viewName, {
          ...this.getViewModel(request, context),
          parcelName: `${sheetId} ${parcelId}`,
          errorSummary: validateUserInput.errorSummary,
          errors: validateUserInput.errors
        })
      }

      // Load available actions for the land parcel
      await this.fetchAvailableActionsFromApi(parcelId, sheetId, request, state)

      const { actionsObj } = this.extractActionsDataFromPayload(payload)
      // Create an updated state with the new action data
      const newState = await this.buildNewState(state, actionsObj)

      if (payload.action === 'validate') {
        const { errors, errorSummary } = await this.validateActionsWithApiData(actionsObj, sheetId, parcelId)

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

  fetchAvailableActionsFromApi = async (parcelId, sheetId, request, state) => {
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
  }

  /**
   * Validate the user input submitted from the page
   * @param {string} landAction - The land action selected by the user
   * @returns {object} - An object containing errors and error summary
   */
  validateUserInput(landAction) {
    const result = {}
    const errors = {}

    if (landAction === '') {
      errors.landAction = {
        text: 'Select an action to do on this land parcel'
      }
      const errorSummary = Object.entries(errors).map(([, { text }]) => ({
        text,
        href: '#landAction'
      }))

      result.errors = errors
      result.errorSummary = errorSummary
    }

    return result
  }

  validateActionsWithApiData = async (actionsObj, sheetId, parcelId) => {
    const errors = {}

    if (Object.keys(actionsObj).length > 0) {
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

  buildNewState = async (state, actionsObj) => {
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
      payment: paymentDetails?.payment,
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
