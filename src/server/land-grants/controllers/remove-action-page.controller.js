import LandGrantsQuestionWithAuthCheckController from '~/src/server/land-grants/controllers/auth/land-grants-question-with-auth-check.controller.js'

const checkSelectedLandActionsPath = '/check-selected-land-actions'
const selectActionsForParcelPath = '/select-actions-for-land-parcel'
const selectLandParcelPath = '/select-land-parcel'

export default class RemoveActionPageController extends LandGrantsQuestionWithAuthCheckController {
  viewName = 'remove-action'

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
   * @param {string} parcel - Parcel key
   * @param {string} action - Action code (optional)
   * @returns {string} - Next path to navigate to
   */
  getNextPathAfterRemoval(newState, parcel, action) {
    const hasRemainingActions = newState.landParcels[parcel]?.actionsObj
    const hasRemainingParcels = Object.keys(newState.landParcels).length > 0

    // remove the only action
    if (!hasRemainingActions && action) {
      return `${selectActionsForParcelPath}?parcelId=${parcel}`
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
   * @param {object} actionInfo - Action description (optional)
   * @param {string} parcelId - Parcel ID
   * @returns {object|null} - Validation error or null if valid
   */
  validatePostPayload(payload, actionInfo, parcelId) {
    const { remove } = payload

    if (remove === undefined) {
      return {
        errorMessage: actionInfo?.description
          ? `Select yes to remove this action from this land parcel`
          : `Select if you want to remove land parcel ${parcelId} from this application`
      }
    }

    return null
  }

  /**
   * Render error view for POST validation
   * @param {object} h - Response toolkit
   * @param {AnyFormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {string} errorMessage - Error message to display
   * @param {string} parcel - Parcel key
   * @param {object} pageHeadingAndHint - Page header amd hint text
   * @returns {object} - Error view response
   */
  renderPostErrorView(h, request, context, errorMessage, parcel, pageHeadingAndHint) {
    return h.view(this.viewName, {
      ...this.getViewModel(request, context),
      parcel,
      ...pageHeadingAndHint,
      errorMessage
    })
  }

  /**
   * Process action or parcel removal
   * @param {AnyFormRequest} request - Request object
   * @param {object} state - Current state
   * @param {object} h - Response toolkit
   * @param {string} parcel - Parcel key
   * @param {string} action - Action code (optional)
   * @returns {Promise<object>} - Response object
   */
  async processRemoval(request, state, h, parcel, action) {
    const newState = action
      ? this.deleteActionFromState(state, parcel, action)
      : this.deleteParcelFromState(state, parcel)
    const nextPath = this.getNextPathAfterRemoval(newState, parcel, action)

    await this.setState(request, newState)
    return this.proceed(request, h, nextPath)
  }

  /**
   * Build view model for GET request
   * @param {AnyFormRequest} request - Request object
   * @param {FormContext} context - Form context
   * @param {string} parcel - Parcel key
   * @param {string} pageHeading - Page heading
   * @param {string} hint - Hint text
   * @returns {object} - Complete view model
   */
  buildGetViewModel(request, context, parcel, pageHeading, hint) {
    return {
      ...this.getViewModel(request, context),
      parcel,
      pageHeading,
      hint
    }
  }

  buildPageHeadingAndHint(actionInfo, parcelId = '') {
    const hint = actionInfo?.description
      ? `Select yes to remove this action from this land parcel. You can add a different action to the same parcel.`
      : `If you remove this land parcel you will also remove all the actions added to this parcel.`

    return {
      pageHeading: actionInfo?.description
        ? `Do you want to remove ${actionInfo.description} from land parcel ${parcelId}?`
        : `Do you want to remove land parcel ${parcelId} from this application?`,
      hint
    }
  }

  /**
   * Handle GET requests to the page
   */
  makeGetRouteHandler() {
    return async (request, context, h) => {
      const { viewName } = this
      const landParcels = context.state?.landParcels
      const { action, parcelId } = request.query

      if (!parcelId || !landParcels[parcelId]) {
        return this.proceed(request, h, checkSelectedLandActionsPath)
      }

      const authResult = await this.performAuthCheck(request, h, parcelId)
      if (authResult) {
        return authResult
      }

      const actionInfo = this.findActionInfo(landParcels, parcelId, action)
      const { pageHeading, hint } = this.buildPageHeadingAndHint(actionInfo, parcelId)

      const viewModel = this.buildGetViewModel(request, context, parcelId, pageHeading, hint)
      return h.view(viewName, viewModel)
    }
  }

  /**
   * Handle POST requests to the page
   */
  makePostRouteHandler() {
    /**
     * Handle POST requests to the confirm farm details page.
     * @param {AnyFormRequest} request
     * @param {FormContext} context
     * @param {Pick<ResponseToolkit, 'redirect' | 'view'>} h
     * @returns {Promise<ResponseObject>}
     */
    const fn = async (request, context, h) => {
      const { state } = context
      const payload = request.payload ?? {}
      const { action, parcelId } = request.query

      const authResult = await this.performAuthCheck(request, h, parcelId)
      if (authResult) {
        return authResult
      }

      // Get pageheading and hint from state for error messages
      const actionInfo = this.findActionInfo(state.landParcels, parcelId, action)
      const pageHeadingAndHint = this.buildPageHeadingAndHint(actionInfo, parcelId)

      const validationError = this.validatePostPayload(payload, actionInfo, parcelId)
      if (validationError) {
        return this.renderPostErrorView(h, request, context, validationError.errorMessage, parcelId, pageHeadingAndHint)
      }

      const { remove } = payload
      if (remove === 'true') {
        return this.processRemoval(request, state, h, parcelId, action)
      }

      return this.proceed(request, h, checkSelectedLandActionsPath)
    }

    return fn
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { ResponseObject, ResponseToolkit } from '@hapi/hapi'
 */
