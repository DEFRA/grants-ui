import {
  fetchAvailableActionsForParcel,
  validateApplication
} from '~/src/server/land-grants/services/land-grants.service.js'
import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { parseLandParcel, stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

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
    const { errors, selectedLandParcel, actions = [], addedActions = [], additionalState = {} } = options
    const [sheetId, parcelId] = parseLandParcel(selectedLandParcel)
    return h.view(this.viewName, {
      ...this.getViewModelWithActions(request, context, actions, addedActions),
      ...additionalState,
      parcelName: `${sheetId} ${parcelId}`,
      errors
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
      log(LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR, { sbi, sheetId, parcelId })
      return null
    }
  }

  /**
   * Handle GET requests to the page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const { state } = context
      const selectedLandParcel = request?.query?.parcelId || state.selectedLandParcel
      const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)

      const authResult = await this.performAuthCheck(request, h, selectedLandParcel)
      if (authResult) {
        return authResult
      }

      const result = await this.fetchActions(request, sheetId, parcelId)
      const groupedActions = result?.actions || []
      const addedActions = this.getAddedActionsForStateParcel(state, selectedLandParcel)

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

      if (!groupedActions.length) {
        log(LogCodes.LAND_GRANTS.NO_ACTIONS_FOUND, { sheetId, parcelId })
      }

      return h.view(this.viewName, {
        ...this.getViewModelWithActions(request, context, groupedActions, addedActions),
        ...state,
        parcelName: `${sheetId} ${parcelId}`,
        existingLandParcels: Object.keys(state.landParcels || {}).length > 0,
        errors: []
      })
    }
  }

  /**
   * This method is called when there is a POST request to the select land actions page.
   * It gets the land parcel id and redirects to the next step in the journey.
   */
  makePostRouteHandler() {
    return async (request, context, h) => {
      const { state: prevState, referenceNumber } = context
      const payload = request.payload ?? {}
      const { sbi, crn } = request.auth.credentials
      const selectedLandParcel = request?.query?.parcelId || prevState.selectedLandParcel
      const [sheetId = '', parcelId = ''] = parseLandParcel(selectedLandParcel)

      const errors = this.validateUserInput(payload)
      if (errors.length > 0) {
        const result = await this.fetchActions(request, sheetId, parcelId)
        const addedActions = this.getAddedActionsForStateParcel(prevState, selectedLandParcel)
        return this.renderErrorView(h, request, context, {
          errors,
          selectedLandParcel,
          actions: result?.actions || [],
          addedActions,
          additionalState: prevState
        })
      }

      const authResult = await this.performAuthCheck(request, h, selectedLandParcel)
      if (authResult) {
        return authResult
      }

      const result = await this.fetchActions(request, sheetId, parcelId)
      if (!result || !result.actions?.length) {
        return this.renderErrorView(h, request, context, {
          errors: [
            {
              text: 'Unable to find actions information for parcel, please try again later or contact the Rural Payments Agency.'
            }
          ],
          selectedLandParcel,
          actions: [],
          addedActions: [],
          additionalState: prevState
        })
      }

      const { actions, parcel } = result
      const state = this.createNewStateFromPayload(prevState, payload, actions, parcel)

      if (payload.action === 'validate') {
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
          log(LogCodes.LAND_GRANTS.VALIDATE_APPLICATION_ERROR, { parcelId, sheetId, message: e.message })
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
