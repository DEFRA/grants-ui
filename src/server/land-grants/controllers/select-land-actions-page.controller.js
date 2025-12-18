import {
  fetchAvailableActionsForParcel,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { parseLandParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
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
      groupedActions: mapGroupedActionsToViewModel(groupedActions, addedActions)
    }
  }

  /**
   * Validate the user input submitted from the page
   * @param {object} payload - The form payload
   * @returns {object} - An object containing errors and error summary
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
      log(
        LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR,
        {
          sbi,
          sheetId,
          parcelId,
          errorMessage: error.message
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
    const addedActions = getAddedActionsForStateParcel(state, selectedLandParcel)

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
      const { state } = context
      const selectedLandParcel = request?.query?.parcelId || (state.selectedLandParcel ?? '')

      const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)

      // Check authorization
      const authResult = await this.performAuthCheck(request, h, selectedLandParcel)
      if (authResult) {
        return authResult
      }

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
    const addedActions = getAddedActionsForStateParcel(prevState, selectedLandParcel)
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
      log(LogCodes.LAND_GRANTS.VALIDATE_APPLICATION_ERROR, { parcelId, sheetId, errorMessage: e.message }, request)
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
   * This method is called when there is a POST request to the select land actions page.
   * It gets the land parcel id and redirects to the next step in the journey.
   */
  makePostRouteHandler() {
    return async (request, context, h) => {
      const { state: prevState } = context
      const payload = request.payload ?? {}
      const selectedLandParcel = request?.query?.parcelId || prevState.selectedLandParcel
      const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)

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
      const state = addActionsToExistingState(prevState, payload, this.actionFieldPrefix, actions, parcel)

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
 */
