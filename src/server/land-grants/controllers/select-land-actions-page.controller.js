import {
  fetchAvailableActionsForParcel,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { parseLandParcel, stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { formatAreaUnit } from '~/src/server/land-grants/utils/format-area-unit.js'

export default class SelectLandActionsPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'select-actions-for-land-parcel'
  actionFieldPrefix = 'landAction_'

  extractLandActionFieldsFromPayload(payload) {
    return Object.keys(payload).filter((key) => key.startsWith(this.actionFieldPrefix))
  }

  mapActionToViewModel(action, addedActions) {
    const existingActions = addedActions.map((a) => a.code)
    return {
      value: action.code,
      text: action.description,
      checked: existingActions.includes(action.code),
      hint: {
        html:
          `Payment rate per year: <strong>£${action.ratePerUnitGbp?.toFixed(2)} per hectare</strong>` +
          (action.ratePerAgreementPerYearGbp
            ? ` and <strong>£${action.ratePerAgreementPerYearGbp}</strong> per agreement`
            : '')
      }
    }
  }

  /**
   * Get view model for the page with actions
   * @param {AnyFormRequest} request - The request object
   * @param {FormContext} context - The form context
   * @param {Array} groupedActions - The grouped actions
   * @param {Array} addedActions - The added actions
   * @returns {object} - The view model for the page
   */
  getViewModelWithActions(request, context, groupedActions, addedActions) {
    return {
      ...super.getViewModel(request, context),
      actionFieldPrefix: this.actionFieldPrefix,
      addedActions,
      groupedActions: groupedActions.map((group) => ({
        ...group,
        actions: group.actions.map((action) => this.mapActionToViewModel(action, addedActions))
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
   * @param {Parcel} parcel - The selected land parcel ID
   * @returns {object} - Updated state
   */
  buildNewState(state, actionsObj, parcel) {
    const { parcelId, sheetId } = parcel
    const selectedLandParcel = stringifyParcel({ parcelId, sheetId })

    return {
      ...state,
      landParcels: {
        ...state.landParcels,
        [selectedLandParcel]: { size: parcel.size, actionsObj }
      }
    }
  }

  createNewStateFromPayload(state, payload, groupedActions, parcel) {
    const landActionFields = this.extractLandActionFieldsFromPayload(payload)
    if (landActionFields.length === 0) {
      return {}
    }

    const actionsObj = {}
    const allActions = groupedActions.flatMap((g) => g.actions)
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

    return this.buildNewState(state, actionsObj, parcel)
  }

  /**
   * Extract added actions from state for the current parcel
   * @param {object} state - Current state
   * @param {string} selectedLandParcel - The selected land parcel ID
   * @returns {Array} - Array of added actions
   */
  getAddedActionsForStateParcel(state, selectedLandParcel) {
    const addedActions = []
    const parcelData = state.landParcels?.[selectedLandParcel]?.actionsObj

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
   * Render error view
   */
  renderErrorView(h, request, context, options) {
    const {
      errors,
      selectedLandParcel,
      actions = [],
      addedActions = [],
      additionalState,
      existingLandParcels = {}
    } = options
    const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)
    return h.view(this.viewName, {
      ...this.getViewModelWithActions(request, context, actions, addedActions),
      ...additionalState,
      parcelName: `${sheetId} ${parcelId}`,
      errors,
      existingLandParcels
    })
  }

  /**
   * Fetch actions with error handling
   */
  async fetchActions(request, sheetId, parcelId) {
    try {
      return await fetchAvailableActionsForParcel({ parcelId, sheetId })
    } catch (error) {
      const { sbi } = request.auth.credentials
      log(
        LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR,
        {
          sbi,
          sheetId,
          parcelId,
          message: error.message
        },
        request
      )
      return null
    }
  }

  /**
   * Fetch and prepare actions data for display
   */
  async fetchAndPrepareActions(request, context, selectedLandParcel, sheetId, parcelId) {
    const { state } = context
    const result = await this.fetchActions(request, sheetId, parcelId)
    const groupedActions = result?.actions || []
    const addedActions = this.getAddedActionsForStateParcel(state, selectedLandParcel)

    return { result, groupedActions, addedActions }
  }

  /**
   * Render success view with actions
   */
  renderSuccessView(h, request, context, groupedActions, addedActions, sheetId, parcelId) {
    const { state } = context

    if (!groupedActions.length) {
      log(LogCodes.LAND_GRANTS.NO_ACTIONS_FOUND, { sheetId, parcelId }, request)
    }

    return h.view(this.viewName, {
      ...this.getViewModelWithActions(request, context, groupedActions, addedActions),
      ...state,
      parcelName: `${sheetId} ${parcelId}`,
      existingLandParcels: Object.keys(state.landParcels || {}).length > 0,
      errors: []
    })
  }

  /**
   * Handle GET requests to the page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const { state } = context
      const selectedLandParcel = request?.query?.parcelId || (state.selectedLandParcel ?? '')

      const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)

      // Check authorization
      const authResult = await this.performAuthCheck(request, h, selectedLandParcel)
      if (authResult) {
        return authResult
      }

      this.title = `Select actions for land parcel ${sheetId} ${parcelId}`

      // Fetch and prepare actions data
      const { result, groupedActions, addedActions } = await this.fetchAndPrepareActions(
        request,
        context,
        selectedLandParcel,
        sheetId,
        parcelId
      )

      // Handle error case when actions cannot be fetched
      if (!result) {
        return this.renderErrorView(h, request, context, {
          errors: [
            {
              text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
            }
          ],
          selectedLandParcel,
          actions: [],
          addedActions: []
        })
      }

      // Render success view
      return this.renderSuccessView(h, request, context, groupedActions, addedActions, sheetId, parcelId)
    }
  }

  /**
   * Handle validation errors by rendering error view with actions
   * @param {object} options - Validation error options
   * @param {object} options.h - Hapi response toolkit
   * @param {object} options.request - Request object
   * @param {object} options.context - Form context
   * @param {Array} options.errors - Validation errors
   * @param {string} options.selectedLandParcel - Selected land parcel ID
   * @param {string} options.sheetId - Sheet ID
   * @param {string} options.parcelId - Parcel ID
   * @param {object} options.prevState - Previous state
   * @param {boolean} options.existingLandParcels - Whether there are existing land parcels in the draft application
   */
  async handleValidationErrors(options) {
    const { h, request, context, errors, selectedLandParcel, sheetId, parcelId, prevState, existingLandParcels } =
      options
    const result = await this.fetchActions(request, sheetId, parcelId)
    const addedActions = this.getAddedActionsForStateParcel(prevState, selectedLandParcel)
    return this.renderErrorView(h, request, context, {
      errors,
      selectedLandParcel,
      actions: result?.actions || [],
      addedActions,
      additionalState: prevState,
      existingLandParcels
    })
  }

  /**
   * Handle application validation when action is 'validate'
   * @param {object} options - Validation options
   * @param {object} options.h - Hapi response toolkit
   * @param {object} options.request - Request object
   * @param {object} options.context - Form context
   * @param {object} options.payload - Form payload
   * @param {Array} options.actions - Available actions
   * @param {string} options.selectedLandParcel - Selected land parcel ID
   * @param {string} options.sheetId - Sheet ID
   * @param {string} options.parcelId - Parcel ID
   * @param {object} options.state - New state
   * @param {object} options.prevState - Previous state
   */
  async handleApplicationValidation(options) {
    const { h, request, context, payload, actions, selectedLandParcel, sheetId, parcelId, state, prevState } = options

    const { referenceNumber } = context
    const { sbi, crn } = request.auth.credentials

    try {
      const validationResult = await validateApplication({ applicationId: referenceNumber, sbi, crn, state })
      const { valid, errorMessages = [] } = validationResult

      if (!valid) {
        const landActionFields = this.extractLandActionFieldsFromPayload(payload)
        const validationErrors = errorMessages
          .filter((e) => !e.passed)
          .map((e) => ({
            text: `${e.description}${e.code ? ': ' + e.code : ''}`,
            href: e.code ? `#${landActionFields.find((field) => payload[field] === e.code)}` : undefined
          }))

        const addedActions = this.getAddedActionsForStateParcel(prevState, selectedLandParcel)
        return this.renderErrorView(h, request, context, {
          errors: validationErrors,
          selectedLandParcel,
          actions,
          addedActions,
          additionalState: state
        })
      }
    } catch (e) {
      log(LogCodes.LAND_GRANTS.VALIDATE_APPLICATION_ERROR, { parcelId, sheetId, message: e.message }, request)
      const addedActions = this.getAddedActionsForStateParcel(prevState, selectedLandParcel)
      return this.renderErrorView(h, request, context, {
        errors: [
          {
            text: 'There has been an issue validating the application, please try again later or contact the Rural Payments Agency.',
            href: ''
          }
        ],
        selectedLandParcel,
        actions,
        addedActions,
        additionalState: state
      })
    }
    return null
  }

  /**
   * This method is called when there is a POST request to the select land actions page.
   * It gets the land parcel id and redirects to the next step in the journey.
   */
  makePostRouteHandler() {
    return async (request, context, h) => {
      const { state: prevState } = context
      const payload = request.payload ?? {}
      const selectedLandParcel = request?.query?.parcelId || prevState.selectedLandParcel
      const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)

      this.title = `Select actions for land parcel ${sheetId} ${parcelId}`

      const existingLandParcels = Object.keys(context.state.landParcels || {}).length > 0

      // Validate user input
      const errors = this.validateUserInput(payload)
      if (errors.length > 0) {
        return this.handleValidationErrors({
          h,
          request,
          context,
          errors,
          selectedLandParcel,
          sheetId,
          parcelId,
          prevState,
          existingLandParcels
        })
      }

      // Check authorization
      const authResult = await this.performAuthCheck(request, h, selectedLandParcel)
      if (authResult) {
        return authResult
      }

      // check available actions
      const result = await this.fetchActions(request, sheetId, parcelId)
      if (!result?.actions?.length) {
        return this.renderErrorView(h, request, context, {
          errors: [
            {
              text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
            }
          ],
          selectedLandParcel,
          actions: [],
          addedActions: [],
          additionalState: context.state
        })
      }

      const { actions, parcel } = result
      const state = this.createNewStateFromPayload(prevState, payload, actions, parcel)

      if (payload.action === 'validate') {
        const validationResult = await this.handleApplicationValidation({
          h,
          request,
          context,
          payload,
          actions,
          selectedLandParcel,
          sheetId,
          parcelId,
          state,
          prevState
        })
        if (validationResult) {
          return validationResult
        }
      }

      await this.setState(request, state)
      return this.proceed(request, h, this.getNextPath(context))
    }
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { Parcel } from '~/src/server/land-grants/types/land-grants.client.d.js'
 */
