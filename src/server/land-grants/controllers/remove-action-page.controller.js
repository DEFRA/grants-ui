import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { parseLandParcel } from '../services/land-grants.service.js'

const checkSelectedLandActionsPath = '/check-selected-land-actions'
const selectActionsForParcelPath = '/select-actions-for-land-parcel'

export default class RemoveActionPageController extends QuestionPageController {
  viewName = 'remove-action'
  parcel = ''
  actionDescription = ''
  action = ''

  /**
   * Extract parcel information from query parameters
   * @param {object} query - Request query parameters
   * @returns {object} - Parsed parcel information
   */
  extractParcelInfo(query) {
    const [sheetId = '', parcelId = ''] = parseLandParcel(query.parcel)
    const action = query.action
    const parcelKey = `${sheetId}-${parcelId}`

    return {
      sheetId,
      parcelId,
      action,
      parcelKey,
      parcel: query.parcel
    }
  }

  /**
   * Find action information from land parcels state
   * @param {object} landParcels - Land parcels from state
   * @param {string} parcelKey - Parcel key
   * @param {string} action - Action code
   * @returns {object|null} - Action information or null if not found
   */
  findActionInfo(landParcels, parcelKey, action) {
    const landParcel = landParcels[parcelKey]
    return landParcel?.actionsObj?.[action] || null
  }

  /**
   * Delete action from state and clean up empty parcels
   * @param {object} state - Current state
   * @param {string} action - Action code to remove
   * @param {string} parcelKey - Parcel key
   * @returns {object} - Updated state
   */
  deleteActionFromState(state, action, parcelKey) {
    const newState = { ...state }

    if (newState.landParcels[parcelKey]?.actionsObj) {
      delete newState.landParcels[parcelKey].actionsObj[action]

      if (Object.keys(newState.landParcels[parcelKey].actionsObj).length === 0) {
        delete newState.landParcels[parcelKey]
      }
    }

    return newState
  }

  /**
   * Determine next path after action removal
   * @param {object} newState - Updated state after removal
   * @param {string} parcelKey - Parcel key
   * @param {string} parcel - Original parcel query parameter
   * @returns {string} - Next path to navigate to
   */
  getNextPathAfterRemoval(newState, parcelKey, parcel) {
    const hasRemainingActions = newState.landParcels[parcelKey]?.actionsObj

    return hasRemainingActions ? checkSelectedLandActionsPath : `${selectActionsForParcelPath}?parcel=${parcel}`
  }

  /**
   * Validate POST request payload
   * @param {object} payload - Request payload
   * @returns {object|null} - Validation error or null if valid
   */
  validatePostPayload(payload) {
    const { removeAction } = payload

    if (removeAction === undefined) {
      return {
        errorMessage: 'Please select if you want to remove the action'
      }
    }

    return null
  }

  /**
   * Render error view for POST validation
   * @param {object} h - Response toolkit
   * @param {FormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {string} errorMessage - Error message to display
   * @returns {object} - Error view response
   */
  renderPostErrorView(h, request, context, errorMessage) {
    return h.view(this.viewName, {
      ...this.getViewModel(request, context),
      parcel: this.parcel,
      actionDescription: this.actionDescription,
      errorMessage
    })
  }

  /**
   * Process action removal
   * @param {FormRequest} request - Request object
   * @param {object} state - Current state
   * @param {object} h - Response toolkit
   * @returns {Promise<object>} - Response object
   */
  async processActionRemoval(request, state, h) {
    const [sheetId, parcelId] = parseLandParcel(this.parcel)
    const parcelKey = `${sheetId}-${parcelId}`
    const newState = this.deleteActionFromState(state, this.action, parcelKey)
    const nextPath = this.getNextPathAfterRemoval(newState, parcelKey, this.parcel)

    await this.setState(request, newState)
    return this.proceed(request, h, nextPath)
  }

  /**
   * Build view model for GET request
   * @param {FormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @returns {object} - Complete view model
   */
  buildGetViewModel(request, context) {
    return {
      ...this.getViewModel(request, context),
      parcel: this.parcel,
      actionDescription: this.actionDescription
    }
  }

  /**
   * Handle GET requests to the page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const { viewName } = this
      const {
        state: { landParcels }
      } = context
      const { action, parcelKey, parcel } = this.extractParcelInfo(request.query)
      const actionInfo = this.findActionInfo(landParcels, parcelKey, action)

      // Redirect if parcel or action not found
      if (!actionInfo) {
        return this.proceed(request, h, checkSelectedLandActionsPath)
      }

      this.action = action
      this.parcel = parcel
      this.actionDescription = actionInfo.description

      const viewModel = this.buildGetViewModel(request, context)
      return h.view(viewName, viewModel)
    }
  }

  /**
   * Handle POST requests to the page
   */
  makePostRouteHandler() {
    return async (request, context, h) => {
      const { state } = context
      const payload = request.payload ?? {}

      const validationError = this.validatePostPayload(payload)
      if (validationError) {
        return this.renderPostErrorView(h, request, context, validationError.errorMessage)
      }

      const { removeAction } = payload

      if (removeAction === 'true') {
        return this.processActionRemoval(request, state, h)
      }

      return this.proceed(request, h, checkSelectedLandActionsPath)
    }
  }
}

/**
 * @import { type FormRequest } from '~/src/server/routes/types.js'
 * @import { type FormContext } from '~/src/server/plugins/engine/types.js'
 * @import { type ResponseToolkit } from '@hapi/hapi'
 */
