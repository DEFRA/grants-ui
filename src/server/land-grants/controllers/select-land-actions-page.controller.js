import {
  fetchAvailableActionsForParcel,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { parseLandParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { log, debug, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { mapGroupedActionsToViewModel } from '~/src/server/land-grants/view-models/action.view-model.js'
import {
  addActionsToExistingState,
  getAddedActionsForStateParcel
} from '~/src/server/land-grants/view-state/land-parcel.view-state.js'
import {
  extractLandActionFields,
  validateLandActionsSelection
} from '~/src/server/land-grants/validators/land-actions.validator.js'

export default class SelectLandActionsPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'select-actions-for-land-parcel'
  actionFieldPrefix = 'landAction_'

  /**
   * Resolve parcel identifiers from query or state
   * @param {AnyFormRequest} request
   * @param {object} state
   * @returns {{ selectedLandParcel: string, sheetId: string, parcelId: string }}
   */
  resolveParcelContext(request, state) {
    const selectedLandParcel = request?.query?.parcelId || (state.selectedLandParcel ?? '')
    const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)
    return { selectedLandParcel, sheetId, parcelId }
  }

  /**
   * Get view model for the page with actions
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Array} groupedActions
   * @param {Array} addedActions
   * @returns {object}
   */
  getViewModelWithActions(request, context, groupedActions, addedActions) {
    return {
      ...super.getViewModel(request, context),
      actionFieldPrefix: this.actionFieldPrefix,
      addedActions,
      groupedActions: mapGroupedActionsToViewModel(groupedActions, addedActions)
    }
  }

  /**
   * Validate the user input submitted from the page
   * @param {object} payload
   * @returns {object}
   */
  validateUserInput(payload) {
    return validateLandActionsSelection(payload, this.actionFieldPrefix)
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
      existingLandParcels,
      pageTitle: `Select actions for land parcel ${sheetId} ${parcelId}`
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
      debug(LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR, { sbi, sheetId, parcelId, errorMessage: error.message }, request)
      return null
    }
  }

  /**
   * Fetch and prepare actions data for display
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {{ selectedLandParcel: string, sheetId: string, parcelId: string }} parcel
   */
  async fetchAndPrepareActions(request, context, parcel) {
    const { selectedLandParcel, sheetId, parcelId } = parcel
    const result = await this.fetchActions(request, sheetId, parcelId)
    const groupedActions = result?.actions || []
    const addedActions = getAddedActionsForStateParcel(context.state, selectedLandParcel)

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
      errors: [],
      pageTitle: `Select actions for land parcel ${sheetId} ${parcelId}`
    })
  }

  /**
   * Handle GET requests to the page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const parcel = this.resolveParcelContext(request, context.state)
      if (!parcel.selectedLandParcel) {
        return this.proceed(request, h, '/select-land-parcel')
      }

      const authResult = await this.performAuthCheck(request, h, parcel.selectedLandParcel)
      if (authResult) {
        return authResult
      }

      const { result, groupedActions, addedActions } = await this.fetchAndPrepareActions(request, context, parcel)

      if (!result) {
        return this.renderErrorView(h, request, context, {
          errors: [
            {
              text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
            }
          ],
          selectedLandParcel: parcel.selectedLandParcel,
          actions: [],
          addedActions: []
        })
      }

      return this.renderSuccessView(h, request, context, groupedActions, addedActions, parcel.sheetId, parcel.parcelId)
    }
  }

  /**
   * Handle validation errors by rendering error view with actions
   * @param {object} h - Hapi response toolkit
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {object} options
   * @param {Array} options.errors
   * @param {{ selectedLandParcel: string, sheetId: string, parcelId: string }} options.parcel
   * @param {object} options.prevState
   */
  async handleValidationErrors(h, request, context, { errors, parcel, prevState }) {
    const { selectedLandParcel, sheetId, parcelId } = parcel
    const result = await this.fetchActions(request, sheetId, parcelId)
    const addedActions = getAddedActionsForStateParcel(prevState, selectedLandParcel)
    return this.renderErrorView(h, request, context, {
      errors,
      selectedLandParcel,
      actions: result?.actions || [],
      addedActions,
      additionalState: prevState,
      existingLandParcels: Object.keys(prevState.landParcels || {}).length > 0
    })
  }

  /**
   * Handle application validation when action is 'validate'
   * @param {object} h - Hapi response toolkit
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {object} options
   * @param {object} options.payload
   * @param {Array} options.actions
   * @param {{ selectedLandParcel: string, sheetId: string, parcelId: string }} options.parcel
   * @param {object} options.state
   * @param {object} options.prevState
   */
  async handleApplicationValidation(h, request, context, { payload, actions, parcel, state, prevState }) {
    const { selectedLandParcel, sheetId, parcelId } = parcel
    const { referenceNumber } = context
    const { sbi, crn } = request.auth.credentials

    try {
      const validationResult = await validateApplication({ applicationId: referenceNumber, sbi, crn, state })
      const { valid, errorMessages = [] } = validationResult

      if (!valid) {
        const landActionFields = extractLandActionFields(payload, this.actionFieldPrefix)
        const validationErrors = errorMessages
          .filter((e) => !e.passed)
          .map((e) => ({
            text: `${e.description}${e.code ? ': ' + e.code : ''}`,
            href: e.code ? `#${landActionFields.find((field) => payload[field] === e.code)}` : undefined
          }))

        const addedActions = getAddedActionsForStateParcel(prevState, selectedLandParcel)
        return this.renderErrorView(h, request, context, {
          errors: validationErrors,
          selectedLandParcel,
          actions,
          addedActions,
          additionalState: state
        })
      }
    } catch (e) {
      debug(LogCodes.LAND_GRANTS.VALIDATE_APPLICATION_ERROR, { parcelId, sheetId, errorMessage: e.message }, request)
      const addedActions = getAddedActionsForStateParcel(prevState, selectedLandParcel)
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
   * Handle POST requests to the select land actions page
   */
  makePostRouteHandler() {
    return async (request, context, h) => {
      const { state: prevState } = context
      const payload = request.payload ?? {}
      const parcel = this.resolveParcelContext(request, prevState)

      const errors = this.validateUserInput(payload)
      if (errors.length > 0) {
        return this.handleValidationErrors(h, request, context, { errors, parcel, prevState })
      }

      const authResult = await this.performAuthCheck(request, h, parcel.selectedLandParcel)
      if (authResult) {
        return authResult
      }

      const result = await this.fetchActions(request, parcel.sheetId, parcel.parcelId)
      if (!result?.actions?.length) {
        return this.renderErrorView(h, request, context, {
          errors: [
            {
              text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
            }
          ],
          selectedLandParcel: parcel.selectedLandParcel,
          actions: [],
          addedActions: [],
          additionalState: context.state
        })
      }

      const { actions, parcel: fetchedParcel } = result
      const state = addActionsToExistingState(prevState, payload, this.actionFieldPrefix, actions, fetchedParcel)

      if (payload.action === 'validate') {
        const validationResult = await this.handleApplicationValidation(h, request, context, {
          payload,
          actions,
          parcel,
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
 */
