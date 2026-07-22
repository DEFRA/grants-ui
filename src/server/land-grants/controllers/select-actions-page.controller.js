import SelectActionsBasePageController from '~/src/server/land-grants/controllers/select-actions-base-page.controller.js'
import { mapGroupedActionsToViewModel } from '~/src/server/land-grants/view-models/select-actions.view-model.js'
import { addSelectedActionsToState } from '~/src/server/land-grants/view-state/land-parcel.view-state.js'
import {
  validateSelectedActions,
  validateSelectedActionQuantities
} from '~/src/server/land-grants/validators/land-actions.validator.js'
import {
  SELECTED_ACTIONS_FIELD_NAME,
  getSelectedActionCodes
} from '~/src/server/land-grants/utils/selected-actions-field.js'
import { getActionQuantityFieldName } from '~/src/server/land-grants/utils/action-quantity-field.js'

export default class SelectActionsPageController extends SelectActionsBasePageController {
  viewName = 'select-actions'
  actionFieldName = SELECTED_ACTIONS_FIELD_NAME

  /**
   * Get view model for the page with actions
   * @param {AnyFormRequest} request
   * @param {FormContext} context
   * @param {Array} groupedActions
   * @param {Array} addedActions
   * @param {Record<string, string>} [quantityErrorsByCode] - Quantity validation error text, keyed by action code
   * @returns {object}
   */
  getViewModelWithActions(request, context, groupedActions, addedActions, quantityErrorsByCode = {}) {
    return {
      ...super.getViewModel(request, context),
      actionFieldName: this.actionFieldName,
      addedActions,
      actionItems: mapGroupedActionsToViewModel(groupedActions, addedActions, quantityErrorsByCode)
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
   * @param {Array<{ actions: Array }>} groupedActions
   * @returns {Array<{ text: string, href?: string }>}
   */
  validateActionQuantities(payload, groupedActions) {
    return validateSelectedActionQuantities(
      payload,
      groupedActions.flatMap((g) => g.actions)
    )
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
   * @param {object} prevState
   * @param {object} payload
   * @param {Array} actions
   * @param {object} fetchedParcel
   * @returns {object}
   */
  writeActionsToState(prevState, payload, actions, fetchedParcel) {
    return addSelectedActionsToState(prevState, payload, actions, fetchedParcel)
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
