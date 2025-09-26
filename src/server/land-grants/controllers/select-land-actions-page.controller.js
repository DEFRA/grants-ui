import {
  fetchAvailableActionsForParcel,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { parseLandParcel } from '~/src/server/land-grants/utils/format-parcel.js'

export default class SelectActionsForLandParcelPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'select-actions-for-land-parcel'
  actionFieldPrefix = 'landAction_'
  groupedActions = []
  addedActions = []

  extractLandActionFieldsFromPayload(payload) {
    return Object.keys(payload).filter((key) => key.startsWith(this.actionFieldPrefix))
  }

  mapActionToViewModel(action) {
    const existingActions = this.addedActions.map((a) => a.code)
    return {
      value: action.code,
      text: action.description,
      checked: existingActions.includes(action.code),
      hint: {
        html:
          `Payment rate per year: <strong>£${action.ratePerUnitGbp?.toFixed(2)} per ha</strong>` +
          (action.ratePerAgreementPerYearGbp
            ? ` and <strong>£${action.ratePerAgreementPerYearGbp}</strong> per agreement`
            : '')
      }
    }
  }

  /**
   * Get view model for the page
   * @param {FormRequest} request - The request object
   * @param {FormContext} context - The form context
   * @returns {object} - The view model for the page
   */
  getViewModel(request, context) {
    return {
      ...super.getViewModel(request, context),
      actionFieldPrefix: this.actionFieldPrefix,
      groupedActions: this.groupedActions.map((group) => ({
        ...group,
        actions: group.actions.map(this.mapActionToViewModel.bind(this))
      }))
    }
  }

  /**
   * Validate the user input submitted from the page
   * @param {object} payload - The form payload
   * @returns {object} - An object containing errors and error summary
   */
  validateUserInput(payload) {
    const errors = []
    const landActionFields = this.extractLandActionFieldsFromPayload(payload)

    if (landActionFields.length === 0) {
      const firstActionInput = this.actionFieldPrefix + '1'
      errors.push({ text: 'Select an action to do on this land parcel', href: `#${firstActionInput}` })
    }

    return errors
  }

  /**
   * Build new state by adding actions
   * @param {object} state - The state object
   * @param {object} actionsObj - The actions object to be added to the state
   * @returns {object} - Updated state
   */
  buildNewState(state, actionsObj) {
    return {
      ...state,
      landParcels: {
        ...state.landParcels,
        [this.selectedLandParcel]: { actionsObj }
      }
    }
  }

  createNewStateFromPayload(state, payload) {
    const landActionFields = this.extractLandActionFieldsFromPayload(payload)
    if (landActionFields.length === 0) {
      return {}
    }

    const actionsObj = {}
    const allActions = this.groupedActions.flatMap((g) => g.actions)
    for (const fieldName of landActionFields) {
      const actionCode = payload[fieldName]
      const actionInfo = allActions.find((a) => a.code === actionCode)
      if (actionCode && actionInfo) {
        actionsObj[actionCode] = {
          description: actionInfo.description,
          value: actionInfo?.availableArea?.value ?? '',
          unit: actionInfo?.availableArea?.unit ?? ''
        }
      }
    }

    return this.buildNewState(state, actionsObj)
  }

  /**
   * Extract added actions from state for the current parcel
   * @param {object} state - Current state
   * @returns {Array} - Array of added actions
   */
  getAddedActionsForStateParcel(state) {
    const addedActions = []
    const parcelData = state.landParcels?.[this.selectedLandParcel]?.actionsObj

    if (parcelData) {
      Object.keys(parcelData).forEach((code) => {
        addedActions.push({
          code,
          description: parcelData[code].description
        })
      })
    }

    return addedActions
  }

  /**
   * Load available actions for the land parcel
   * @param {string} sheetId - Sheet ID
   * @param {string} parcelId - Parcel ID
   * @param {object} logger - Request logger
   * @returns {object} - Load result
   */
  async loadAvailableActions(sheetId, parcelId, logger) {
    try {
      this.groupedActions = await fetchAvailableActionsForParcel({ parcelId, sheetId })

      if (!this.groupedActions.length) {
        logger.error({
          message: `No actions found for parcel ${sheetId}-${parcelId}`,
          selectedLandParcel: `${sheetId}-${parcelId}`
        })
        return { success: true, hasActions: false }
      }

      return { success: true, hasActions: true }
    } catch (error) {
      this.groupedActions = []
      logger.error(error, `Failed to fetch land parcel data for id ${sheetId}-${parcelId}`)
      return { success: false, error }
    }
  }

  /**
   * Render error view with validation errors
   * @param {object} h - Response toolkit
   * @param {FormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {object} validation - Validation result
   * @param {string} sheetId - Sheet ID
   * @param {string} parcelId - Parcel ID
   * @param {object} additionalState - Additional state to merge
   * @returns {object} - Error view response
   */
  renderErrorView(h, request, context, errorSummary, additionalState = {}) {
    const [sheetId, parcelId] = parseLandParcel(this.selectedLandParcel)
    return h.view(this.viewName, {
      ...this.getViewModel(request, context),
      ...additionalState,
      parcelName: `${sheetId} ${parcelId}`,
      addedActions: this.addedActions,
      errorSummary
    })
  }

  /**
   * Handle GET requests to the page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const { collection, viewName } = this
      const { state } = context
      this.selectedLandParcel = request?.query?.parcelId || state.selectedLandParcel
      const [sheetId = '', parcelId = ''] = parseLandParcel(this.selectedLandParcel)

      const authResult = await this.performAuthCheck(request, h)
      if (authResult) {
        return authResult
      }

      try {
        this.groupedActions = await fetchAvailableActionsForParcel({ parcelId, sheetId })
        if (!this.groupedActions.length) {
          request.logger.error({
            message: `No actions found for parcel ${sheetId}-${parcelId}`,
            selectedLandParcel: this.selectedLandParcel
          })
        }
      } catch (error) {
        this.groupedActions = []
        request.logger.error(error, `Failed to fetch land parcel data for id ${sheetId}-${parcelId}`)
      }

      this.addedActions = this.getAddedActionsForStateParcel(state)

      await this.loadAvailableActions(sheetId, parcelId, request.logger)

      const viewModel = {
        ...this.getViewModel(request, context),
        ...state,
        addedActions: this.addedActions,
        parcelName: `${sheetId} ${parcelId}`,
        errors: collection.getErrors(collection.getErrors())
      }

      return h.view(viewName, viewModel)
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
      const { state: prevState, referenceNumber } = context
      const payload = request.payload ?? {}
      const { sbi, crn } = request.auth.credentials

      const authResult = await this.performAuthCheck(request, h)
      if (authResult) {
        return authResult
      }

      const errors = this.validateUserInput(payload)
      if (errors.length > 0) {
        return this.renderErrorView(h, request, context, errors, prevState)
      }

      const state = this.createNewStateFromPayload(prevState, payload)

      if (payload.action === 'validate') {
        const validationResult = await validateApplication({ applicationId: referenceNumber, sbi, crn, state })
        const { valid, errorMessages = [] } = validationResult

        if (!valid) {
          const landActionFields = this.extractLandActionFieldsFromPayload(payload)
          const errors = errorMessages
            .filter((e) => !e.passed)
            .map((e) => ({
              text: `${e.description}: ${e.code}`,
              href: `#${landActionFields.find((field) => payload[field] === e.code)}`
            }))

          return this.renderErrorView(h, request, context, errors, state)
        }
      }

      await this.setState(request, state)
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
