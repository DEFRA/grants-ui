import {
  fetchAvailableActionsForParcel,
  triggerApiActionsValidation
} from '~/src/server/land-grants/services/land-grants.service.js'
import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { parseLandParcel } from '~/src/server/land-grants/utils/format-parcel.js'

const createErrorSummary = (errors) =>
  Object.entries(errors).map(([field, { text }]) => ({
    text,
    href: `#${field}`
  }))

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
   * Extract action data from the form payload
   * @param {object} payload - The form payload
   * @returns {object} - Extracted action data
   */
  extractActionsDataFromPayload(payload) {
    const actionsObj = {}
    const landActionFields = this.extractLandActionFieldsFromPayload(payload)

    if (landActionFields.length === 0) {
      return { actionsObj }
    }

    const availableActions = this.groupedActions.flatMap((g) => g.actions)

    for (const fieldName of landActionFields) {
      const actionCode = payload[fieldName]

      if (!actionCode || actionCode === '') {
        continue
      }

      const actionInfo = availableActions.find((a) => a.code === actionCode)

      if (actionInfo) {
        const result = {
          description: actionInfo.description,
          value: actionInfo?.availableArea?.value ?? '',
          unit: actionInfo?.availableArea?.unit ?? ''
        }
        actionsObj[actionCode] = result
      }
    }

    return { actionsObj }
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
    const errors = {}
    const landActionFields = this.extractLandActionFieldsFromPayload(payload)

    const hasSelection = landActionFields.some((field) => {
      const value = payload[field]
      return value && value !== ''
    })

    if (!hasSelection) {
      const firstField = landActionFields[0] || this.actionFieldPrefix + '1'
      errors[firstField] = {
        text: 'Select an action to do on this land parcel'
      }
    }

    return {
      errors,
      errorSummary: createErrorSummary(errors)
    }
  }

  /**
   * Validate actions with API data
   * @param {object} payload - The form payload
   * @param {object} actionsObj - Actions object to validate
   * @param {string} sheetId - Sheet ID
   * @param {string} parcelId - Parcel ID
   * @returns {object} - Validation result with errors
   */
  async validateActionsWithApiData(payload, actionsObj, sheetId, parcelId) {
    const errors = {}

    if (Object.keys(actionsObj).length === 0) {
      return { errors, errorSummary: [] }
    }

    const { valid, errorMessages = [] } = await triggerApiActionsValidation({
      sheetId,
      parcelId,
      actionsObj
    })

    if (!valid) {
      for (const apiError of errorMessages) {
        const foundKey = Object.keys(payload).find(
          (key) => key.startsWith(this.actionFieldPrefix) && payload[key] === apiError.code
        )
        const index = Number(foundKey.replace(this.actionFieldPrefix, '')) || 1
        errors[`${this.actionFieldPrefix}${index}`] = {
          text: apiError.description
        }
      }
    }

    return {
      errors,
      errorSummary: createErrorSummary(errors)
    }
  }

  /**
   * Create action to group mapping for conflict resolution
   * @returns {Map} - Map of action codes to their groups
   */
  createActionToGroupMap() {
    const actionToGroupMap = new Map()
    this.groupedActions.forEach((group) => {
      group.actions.forEach((action) => {
        actionToGroupMap.set(action.code, group)
      })
    })
    return actionToGroupMap
  }

  /**
   * Filter existing actions to remove conflicts (actions in same group) with new actions
   * @param {object} existingActions - Current actions
   * @param {string[]} newActionCodes - New action codes being added
   * @returns {object} - Filtered existing actions
   */
  removeConflictingActions(existingActions, newActionCodes) {
    const actionToGroupMap = this.createActionToGroupMap()
    const filteredActions = {}

    Object.entries(existingActions).forEach(([existingActionCode, actionData]) => {
      const existingGroup = actionToGroupMap.get(existingActionCode)

      const hasConflict = newActionCodes.some((newActionCode) => {
        const newGroup = actionToGroupMap.get(newActionCode)
        return existingGroup && newGroup && existingGroup === newGroup
      })

      if (!hasConflict && newActionCodes.includes(actionData.code)) {
        filteredActions[existingActionCode] = actionData
      }
    })

    return filteredActions
  }

  /**
   * Create new parcel state when parcel doesn't exist
   * @param {object} state - Current state
   * @param {object} actionsObj - Actions to add
   * @returns {object} - New state
   */
  createNewParcelState(state, actionsObj) {
    return {
      ...state,
      landParcels: {
        ...state.landParcels,
        [this.selectedLandParcel]: { actionsObj }
      }
    }
  }

  /**
   * Update existing parcel state with new actions
   * @param {object} state - Current state
   * @param {object} currentParcel - Current parcel data
   * @param {object} actionsObj - Actions to add
   * @returns {object} - Updated state
   */
  updateExistingParcelState(state, currentParcel, actionsObj) {
    const existingActions = currentParcel.actionsObj || {}
    const newActionCodes = Object.keys(actionsObj)
    const conflictFreeActions = this.removeConflictingActions(existingActions, newActionCodes)

    return {
      ...state,
      landParcels: {
        ...state.landParcels,
        [this.selectedLandParcel]: {
          ...currentParcel,
          actionsObj: { ...conflictFreeActions, ...actionsObj }
        }
      }
    }
  }

  /**
   * Build new state by adding or replacing actions
   * @param {object} state - The state object
   * @param {object} actionsObj - The actions object to be added to the state
   * @returns {object} - Updated state
   */
  buildNewState(state, actionsObj) {
    const { landParcels = {} } = state
    const currentParcel = landParcels[this.selectedLandParcel]

    if (!currentParcel) {
      return this.createNewParcelState(state, actionsObj)
    }

    return this.updateExistingParcelState(state, currentParcel, actionsObj)
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
  renderErrorView(h, request, context, validation, sheetId, parcelId, additionalState = {}) {
    return h.view(this.viewName, {
      ...this.getViewModel(request, context),
      ...additionalState,
      parcelName: `${sheetId} ${parcelId}`,
      addedActions: this.addedActions,
      errorSummary: validation.errorSummary,
      errors: validation.errors
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

      const authResult = await this.performAuthCheck(request, context, h)
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
      const { state } = context
      const payload = request.payload ?? {}
      const [sheetId, parcelId] = parseLandParcel(this.selectedLandParcel)

      const authResult = await this.performAuthCheck(request, context, h)
      if (authResult) {
        return authResult
      }

      const inputValidation = this.validateUserInput(payload)
      if (Object.keys(inputValidation.errors).length > 0) {
        return this.renderErrorView(h, request, context, inputValidation, sheetId, parcelId)
      }

      const { actionsObj } = this.extractActionsDataFromPayload(payload)
      const newState = this.buildNewState(state, actionsObj)

      if (payload.action === 'validate') {
        const apiValidation = await this.validateActionsWithApiData(payload, actionsObj, sheetId, parcelId)
        if (Object.keys(apiValidation.errors).length > 0) {
          return this.renderErrorView(h, request, context, apiValidation, sheetId, parcelId, newState)
        }
      }

      await this.setState(request, newState)
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
