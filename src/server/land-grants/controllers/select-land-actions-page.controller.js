import {
  fetchAvailableActionsForParcel,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { parseLandParcel } from '~/src/server/land-grants/utils/format-parcel.js'

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
          `Payment rate per year: <strong>£${action.ratePerUnitGbp?.toFixed(2)} per ha</strong>` +
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
   * @param {string} selectedLandParcel - The selected land parcel ID
   * @returns {object} - Updated state
   */
  buildNewState(state, actionsObj, selectedLandParcel) {
    return {
      ...state,
      landParcels: {
        ...state.landParcels,
        [selectedLandParcel]: { actionsObj }
      }
    }
  }

  createNewStateFromPayload(state, payload, groupedActions, selectedLandParcel) {
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

    return this.buildNewState(state, actionsObj, selectedLandParcel)
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
   * Render error message with validation errors
   * @param {object} h - Response toolkit
   * @param {AnyFormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {object} options - Error rendering options
   * @param {Array} options.errors - Errors array
   * @param {string} options.selectedLandParcel - The selected land parcel ID
   * @param {Array} [options.groupedActions] - The grouped actions
   * @param {Array} [options.addedActions] - The added actions
   * @param {object} [options.additionalState] - Additional state to merge
   * @returns {object} - Error view response
   */
  renderErrorMessage(h, request, context, options) {
    const { errors, selectedLandParcel, groupedActions = [], addedActions = [], additionalState = {} } = options

    const [sheetId, parcelId] = parseLandParcel(selectedLandParcel)
    return h.view(this.viewName, {
      ...this.getViewModelWithActions(request, context, groupedActions, addedActions),
      ...additionalState,
      parcelName: `${sheetId} ${parcelId}`,
      errors
    })
  }

  /**
   * Fetch actions and handle errors for GET request
   * @private
   */
  async fetchActionsForGet(request, state, selectedLandParcel, sheetId, parcelId) {
    let errors = []
    let groupedActions = []
    let addedActions = []

    try {
      groupedActions = await fetchAvailableActionsForParcel({ parcelId, sheetId })
      if (!groupedActions.length) {
        request.logger.error({
          message: `No actions found for parcel ${sheetId}-${parcelId}`,
          selectedLandParcel
        })
      }
      addedActions = this.getAddedActionsForStateParcel(state, selectedLandParcel)
    } catch (error) {
      const sbi = request.auth?.credentials?.sbi
      request.logger.error({ err: error, sbi, sheetId, parcelId }, 'Unexpected error when fetching actions data')
      errors = [
        {
          text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
        }
      ]
    }

    return { errors, groupedActions, addedActions }
  }

  /**
   * Build view model for GET request
   * @private
   */
  buildGetViewModel(request, context, sheetId, parcelId, groupedActions, addedActions, errors) {
    const { state } = context
    const existingLandParcels = Object.keys(state.landParcels || {}).length > 0

    return {
      ...this.getViewModelWithActions(request, context, groupedActions, addedActions),
      ...state,
      parcelName: `${sheetId} ${parcelId}`,
      existingLandParcels,
      errors
    }
  }

  /**
   * Handle GET requests to the page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const { viewName } = this
      const { state } = context
      const selectedLandParcel = request?.query?.parcelId || state.selectedLandParcel
      const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)

      const authResult = await this.performAuthCheck(request, h, selectedLandParcel)
      if (authResult) {
        return authResult
      }

      const { errors, groupedActions, addedActions } = await this.fetchActionsForGet(
        request,
        state,
        selectedLandParcel,
        sheetId,
        parcelId
      )

      const viewModel = this.buildGetViewModel(
        request,
        context,
        sheetId,
        parcelId,
        groupedActions,
        addedActions,
        errors
      )

      return h.view(viewName, viewModel)
    }
  }

  /**
   * Fetch actions for POST request
   * @private
   */
  async fetchActionsForPost(request, prevState, selectedLandParcel, sheetId, parcelId) {
    let fetchedGroupedActions = []
    let fetchedAddedActions = []

    try {
      fetchedGroupedActions = await fetchAvailableActionsForParcel({ parcelId, sheetId })
      fetchedAddedActions = this.getAddedActionsForStateParcel(prevState, selectedLandParcel)
    } catch (error) {
      request.logger.error({ err: error }, 'Error fetching actions for POST processing')
    }

    return { fetchedGroupedActions, fetchedAddedActions }
  }

  /**
   * Handle validation errors from POST request
   * @private
   */
  async handlePostValidationErrors(request, context, h, options) {
    const { errors, selectedLandParcel, prevState, sheetId, parcelId } = options
    const { fetchedGroupedActions, fetchedAddedActions } = await this.fetchActionsForPost(
      request,
      prevState,
      selectedLandParcel,
      sheetId,
      parcelId
    )

    return this.renderErrorMessage(h, request, context, {
      errors,
      selectedLandParcel,
      groupedActions: fetchedGroupedActions,
      addedActions: fetchedAddedActions,
      additionalState: prevState
    })
  }

  /**
   * Handle application validation when action is 'validate'
   * @private
   */
  async handleApplicationValidation(request, context, h, options) {
    const { referenceNumber } = context
    const { payload, sbi, crn, state, selectedLandParcel, fetchedGroupedActions, fetchedAddedActions } = options

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

        return this.renderErrorMessage(h, request, context, {
          errors: validationErrors,
          selectedLandParcel,
          groupedActions: fetchedGroupedActions,
          addedActions: fetchedAddedActions,
          additionalState: state
        })
      }
    } catch (e) {
      request.logger.error({
        message: e.message,
        selectedLandParcel
      })
      return this.renderErrorMessage(h, request, context, {
        errors: [
          {
            text: 'There has been an issue validating the application, please try again later or contact the Rural Payments Agency.',
            href: ''
          }
        ],
        selectedLandParcel,
        groupedActions: fetchedGroupedActions,
        addedActions: fetchedAddedActions,
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
    /**
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const { state: prevState } = context
      const payload = request.payload ?? {}
      const { sbi, crn } = request.auth.credentials
      const selectedLandParcel = request?.query?.parcelId || prevState.selectedLandParcel
      const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)

      const errors = this.validateUserInput(payload)
      if (errors.length > 0) {
        return this.handlePostValidationErrors(request, context, h, {
          errors,
          selectedLandParcel,
          prevState,
          sheetId,
          parcelId
        })
      }

      const authResult = await this.performAuthCheck(request, h, selectedLandParcel)
      if (authResult) {
        return authResult
      }

      // Fetch actions to process payload
      const { fetchedGroupedActions, fetchedAddedActions } = await this.fetchActionsForPost(
        request,
        prevState,
        selectedLandParcel,
        sheetId,
        parcelId
      )

      if (fetchedGroupedActions.length === 0) {
        return this.renderErrorMessage(h, request, context, {
          errors: [
            {
              text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
            }
          ],
          selectedLandParcel,
          groupedActions: [],
          addedActions: [],
          additionalState: prevState
        })
      }

      const state = this.createNewStateFromPayload(prevState, payload, fetchedGroupedActions, selectedLandParcel)

      if (payload.action === 'validate') {
        const validationResult = await this.handleApplicationValidation(request, context, h, {
          payload,
          sbi,
          crn,
          state,
          selectedLandParcel,
          fetchedGroupedActions,
          fetchedAddedActions
        })

        if (validationResult) {
          return validationResult
        }
      }

      await this.setState(request, state)
      return this.proceed(request, h, this.getNextPath(context))
    }

    return fn
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
