import SelectActionsBasePageController from '~/src/server/land-grants/controllers/select-actions-base-page.controller.js'
import {
  mapActionsToViewModel,
  getPageConsents
} from '~/src/server/land-grants/view-models/select-actions.view-model.js'
import {
  addSelectedActionsToState,
  buildPlannedActionsFromPayload,
  getAddedActionsFromPayload,
  mergeRecomputedAvailability
} from '~/src/server/land-grants/view-state/land-parcel.view-state.js'
import {
  validateSelectedActions,
  validateSelectedActionQuantities
} from '~/src/server/land-grants/validators/land-actions.validator.js'
import {
  SELECTED_ACTIONS_FIELD_NAME,
  getSelectedActionCodes
} from '~/src/server/land-grants/utils/selected-actions-field.js'
import { getActionQuantityFieldName } from '~/src/shared/action-quantity-field.js'
import {
  fetchActionsForParcel,
  fetchActionsWithPlannedActions
} from '~/src/server/land-grants/services/land-grants.service.js'
import { error, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { getLandGrantsUserContext } from '~/src/server/land-grants/services/land-grants-user-context.js'

export default class SelectActionsPageController extends SelectActionsBasePageController {
  viewName = 'select-actions'
  actionFieldName = SELECTED_ACTIONS_FIELD_NAME
  fetchActionsService = fetchActionsForParcel

  /**
   * Get view model for the page with actions
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Array} actions
   * @param {Array} addedActions
   * @param {Record<string, string>} [quantityErrorsByCode] - Quantity validation error text, keyed by action code
   * @returns {object}
   */
  getViewModelWithActions(request, context, actions, addedActions, quantityErrorsByCode = {}) {
    return {
      ...super.getViewModel(request, context),
      actionFieldName: this.actionFieldName,
      addedActions,
      actionItems: mapActionsToViewModel(actions, addedActions, quantityErrorsByCode),
      pageConsents: getPageConsents(actions)
    }
  }

  /**
   * Validate the user input submitted from the page
   * @param {object} payload
   * @returns {object}
   */
  validateUserInput(payload) {
    return validateSelectedActions(payload)
  }

  /**
   * @param {object} payload
   * @param {Array} actions
   * @returns {Array<{ text: string, href?: string }>}
   */
  validateActionQuantities(payload, actions) {
    return validateSelectedActionQuantities(payload, actions)
  }

  /**
   * @param {object} _payload
   * @param {Array<{ code?: string, description: string }>} failedMessages
   * @returns {Array<{ text: string, href?: string }>}
   */
  buildValidationErrors(_payload, failedMessages) {
    return failedMessages.map((e) => ({
      text: `${e.description}${e.code ? ': ' + e.code : ''}`,
      href: e.code ? `#${getActionQuantityFieldName(e.code)}` : undefined
    }))
  }

  /**
   * @param {object} payload
   * @returns {Array<string>}
   */
  extractSelectedActionCodes(payload) {
    return getSelectedActionCodes(payload)
  }

  /**
   * @param {object} payload
   * @param {Array} actions
   * @returns {Array<{ code: string, description: string, value?: string|number }>}
   */
  getAddedActionsForValidationError(payload, actions) {
    return getAddedActionsFromPayload(payload, actions)
  }

  /**
   * @param {object} prevState
   * @param {object} payload
   * @param {Array} actions
   * @param {object} fetchedParcel
   * @returns {object}
   */
  writeActionsToState(prevState, payload, actions, fetchedParcel) {
    return addSelectedActionsToState(prevState, payload, actions, fetchedParcel)
  }

  /**
   * Recomputes availableArea/requiresMaxQuantity for every action against
   * the quantity claims in this same submission.
   * @param {AnyFormRequest} request
   * @param {{ selectedLandParcel: string, sheetId: string, parcelId: string }} parcel
   * @param {object} payload
   * @param {Array} actions
   * @returns {Promise<Array>}
   */
  async recomputeActionsForState(request, parcel, payload, actions) {
    const plannedActions = buildPlannedActionsFromPayload(payload, actions)
    if (!plannedActions.length) {
      return actions
    }

    const { sheetId, parcelId } = parcel
    let recomputed
    try {
      const userContext = getLandGrantsUserContext(request)
      ;({ actions: recomputed } = await fetchActionsWithPlannedActions(
        { parcelId, sheetId, plannedActions },
        userContext
      ))
    } catch (err) {
      const { sbi } = request.auth.credentials
      const { message: errorMessage, status: statusCode } = /** @type {Error & {status?: number}} */ (err)
      error(LogCodes.LAND_GRANTS.FETCH_ACTIONS_ERROR, { sbi, sheetId, parcelId, errorMessage, statusCode }, request)
      return actions
    }

    return mergeRecomputedAvailability(actions, recomputed)
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
