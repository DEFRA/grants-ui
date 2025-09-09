import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import {
  fetchAvailableActionsForParcel,
  parseLandParcel,
  triggerApiActionsValidation
} from '~/src/server/land-grants/services/land-grants.service.js'

export default class SelectActionsForLandParcelPageController extends QuestionPageController {
  viewName = 'select-actions-for-land-parcel'
  availableActions = []
  groupedActions = []
  addedActions = []

  /**
   * Extract action data from the form payload
   * @param {object} payload - The form payload
   * @returns {object} - Extracted action data
   */
  extractActionsDataFromPayload(payload) {
    const actionsObj = {}
    const { landAction } = payload
    let result = {}
    const availableActions = this.groupedActions.flatMap((g) => g.actions)
    const actionInfo = availableActions.find((a) => a.code === landAction)
    if (actionInfo) {
      result = {
        description: actionInfo.description,
        value: actionInfo?.availableArea?.value ?? '',
        unit: actionInfo?.availableArea?.unit ?? ''
      }
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
    const mapActionToViewModel = (action) => ({
      value: action.code,
      text: action.description,
      hint: {
        html:
          `Payment rate per year: <strong>£${action.ratePerUnitGbp.toFixed(2)} per ha</strong>` +
          (action.ratePerAgreementPerYearGbp
            ? ` and <strong>£${action.ratePerAgreementPerYearGbp}</strong> per agreement`
            : '')
      }
    })

    const groupHasAllActionsAdded = (group) => {
      const groupActions = group.actions?.map(a => a.code) || []
      const addedActions = this.addedActions.map(a => a.code) || []
      return groupActions.every(value => addedActions.includes(value))
    }

    return {
      ...super.getViewModel(request, context),
      groupedActions: this.groupedActions.map((group) => ({
        ...group,
        visible: !groupHasAllActionsAdded(group),
        actions: group.actions.map(mapActionToViewModel)
      }))
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
      const landAction = payload.landAction ?? ''
      const [sheetId, parcelId] = parseLandParcel(state.selectedLandParcel)
      const validateUserInput = this.validateUserInput(landAction)

      // Validate user input
      if (validateUserInput?.errors?.landAction) {
        return h.view(viewName, {
          ...this.getViewModel(request, context),
          parcelName: `${sheetId} ${parcelId}`,
          addedActions: this.addedActions,
          errorSummary: validateUserInput.errorSummary,
          errors: validateUserInput.errors
        })
      }

      const { actionsObj } = this.extractActionsDataFromPayload(payload)
      // Create an updated state with the new action data
      const newState = this.buildNewState(state, actionsObj)

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

  /**
   * Adds or replaces actions into the state, taking into account that we can only add 1 action per group
   * @param {object} state - The state object
   * @param {object} actionsObj - The actions object to be added to the state
   * @returns {object} - An object containing the merged actions
   */
  buildNewState = (state, actionsObj) => {
    const { selectedLandParcel, landParcels = {} } = state
    const currentParcel = landParcels[selectedLandParcel]
    if (!currentParcel) {
      return {
        ...state,
        landParcels: {
          ...landParcels,
          [selectedLandParcel]: { actionsObj }
        }
      }
    }

    const existingActions = currentParcel.actionsObj || {}
    const newActionsToAdd = Object.keys(actionsObj)

    const actionToGroupMap = new Map()
    this.groupedActions.forEach(group => {
      group.actions.forEach(action => {
        actionToGroupMap.set(action.code, group)
      })
    })

    const finalActionsObj = { ...actionsObj }

    // Add existing actions that are not in the same group that the new actions we are going to add
    Object.entries(existingActions).forEach(([existingAction, actionData]) => {
      const existingGroup = actionToGroupMap.get(existingAction)

      const hasConflict = newActionsToAdd.some(newAction => {
        const newGroup = actionToGroupMap.get(newAction)
        return existingGroup && newGroup && existingGroup === newGroup
      })

      // existing action to add is not in the same group as newAction, we don't need to replace it
      if (!hasConflict) {
        finalActionsObj[existingAction] = actionData
      }
    })

    return {
      ...state,
      landParcels: {
        ...landParcels,
        [selectedLandParcel]: {
          ...currentParcel,
          actionsObj: finalActionsObj
        }
      }
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

      const getAddedActionsForStateParcel = (state, parcel) => {
        const addedActions = []
        if (state.landParcels && state.landParcels[state.selectedLandParcel]?.actionsObj) {
          for (const code in state.landParcels[state.selectedLandParcel].actionsObj) {
            addedActions.push({ code, description: state.landParcels[state.selectedLandParcel].actionsObj[code].description })
          }
        }
        return addedActions
      }

      this.addedActions = getAddedActionsForStateParcel(state)

      console.log({ addedActions: this.addedActions })
      // Load available actions for the land parcel
      try {
        this.groupedActions = await fetchAvailableActionsForParcel({ parcelId, sheetId })
        if (!this.groupedActions.length) {
          request.logger.error({
            message: `No actions found for parcel ${sheetId}-${parcelId}`,
            selectedLandParcel: state.selectedLandParcel
          })
        }
      } catch (error) {
        this.groupedActions = []
        request.logger.error(error, `Failed to fetch land parcel data for id ${sheetId}-${parcelId}`)
      }

      // Build the view model exactly as in the original code
      const viewModel = {
        ...this.getViewModel(request, context),
        ...state,
        addedActions: this.addedActions,
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
