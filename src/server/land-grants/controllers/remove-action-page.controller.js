import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'
import { parseLandParcel } from '../utils/format-parcel.js'

const checkSelectedLandActionsPath = '/check-selected-land-actions'
const selectActionsForParcelPath = '/select-actions-for-land-parcel'
const selectLandParcelPath = '/select-land-parcel'

export default class RemoveActionPageController extends LandGrantsQuestionWithAuthCheckController {
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
    const [sheetId = '', parcelId = ''] = parseLandParcel(query.parcelId)
    const action = query.action
    const parcelKey = `${sheetId}-${parcelId}`

    return {
      action,
      parcelKey,
      parcel: query.parcelId
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
   * Delete parcel from state object
   * @param {object} state - Current state
   * @param {string} parcel - Parcel key
   * @returns {object} - Updated state
   */
  deleteParcelFromState(state, parcel) {
    const newState = JSON.parse(JSON.stringify(state))
    delete newState.landParcels[parcel]
    return newState
  }

  /**
   * Delete action from state and clean up empty parcels
   * @param {object} state - Current state
   * @param {string} parcel - Parcel key
   * @param {string} action - Action code to remove
   * @returns {object} - Updated state
   */
  deleteActionFromState(state, parcel, action) {
    const newState = JSON.parse(JSON.stringify(state))
    if (newState.landParcels[parcel]?.actionsObj) {
      delete newState.landParcels[parcel].actionsObj[action]

      if (Object.keys(newState.landParcels[parcel].actionsObj).length === 0) {
        delete newState.landParcels[parcel]
      }
    }

    return newState
  }

  /**
   * Determine next path after action removal
   * @param {object} newState - Updated state after removal
   * @returns {string} - Next path to navigate to
   */
  getNextPathAfterRemoval(newState) {
    const hasRemainingActions = newState.landParcels[this.parcel]?.actionsObj
    const hasRemainingParcels = Object.keys(newState.landParcels).length > 0

    // remove the only action
    if (!hasRemainingActions && this.action) {
      return `${selectActionsForParcelPath}?parcelId=${this.parcel}`
    }

    // remove the only parcel
    if (!hasRemainingParcels) {
      return selectLandParcelPath
    }

    return checkSelectedLandActionsPath
  }

  /**
   * Validate POST request payload
   * @param {object} payload - Request payload
   * @returns {object|null} - Validation error or null if valid
   */
  validatePostPayload(payload) {
    const { remove } = payload

    if (remove === undefined) {
      return {
        errorMessage: this.actionDescription
          ? `Select yes to remove ${this.actionDescription} from land parcel ${this.parcel}`
          : `Select yes to remove land parcel ${this.parcel} from this application`
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
   * Process action or parcel removal
   * @param {FormRequest} request - Request object
   * @param {object} state - Current state
   * @param {object} h - Response toolkit
   * @returns {Promise<object>} - Response object
   */
  async processRemoval(request, state, h) {
    const newState = this.action
      ? this.deleteActionFromState(state, this.parcel, this.action)
      : this.deleteParcelFromState(state, this.parcel)
    const nextPath = this.getNextPathAfterRemoval(newState)

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
      if (!parcel) {
        return this.proceed(request, h, checkSelectedLandActionsPath)
      }
      this.selectedLandParcel = parcelKey

      const authResult = await this.performAuthCheck(request, context, h)
      if (authResult) {
        return authResult
      }

      const actionInfo = this.findActionInfo(landParcels, parcelKey, action)

      this.action = action
      this.parcel = parcel
      this.actionDescription = actionInfo?.description

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

      this.selectedLandParcel = this.parcel

      const authResult = await this.performAuthCheck(request, context, h)
      if (authResult) {
        return authResult
      }

      const validationError = this.validatePostPayload(payload)
      if (validationError) {
        return this.renderPostErrorView(h, request, context, validationError.errorMessage)
      }

      const { remove } = payload
      if (remove === 'true') {
        return this.processRemoval(request, state, h)
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
