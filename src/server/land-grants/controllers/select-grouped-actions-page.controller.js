import SelectActionsBasePageController from '~/src/server/land-grants/controllers/select-actions-base-page.controller.js'
import { mapGroupedActionsToViewModel } from '~/src/server/land-grants/view-models/action.view-model.js'
import { addActionsToExistingState } from '~/src/server/land-grants/view-state/land-parcel.view-state.js'
import {
  extractLandActionFields,
  validateLandActionsSelection
} from '~/src/server/land-grants/validators/land-actions.validator.js'

export default class SelectGroupedActionsPageController extends SelectActionsBasePageController {
  viewName = 'select-grouped-actions'
  actionFieldPrefix = 'landAction_'

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
   * @param {object} payload
   * @param {Array<{ code?: string, description: string }>} failedMessages
   * @returns {Array<{ text: string, href?: string }>}
   */
  buildValidationErrors(payload, failedMessages) {
    const landActionFields = extractLandActionFields(payload, this.actionFieldPrefix)
    return failedMessages.map((e) => ({
      text: `${e.description}${e.code ? ': ' + e.code : ''}`,
      href: e.code ? `#${landActionFields.find((field) => payload[field] === e.code)}` : undefined
    }))
  }

  /**
   * @param {object} payload
   * @returns {Array<string>}
   */
  extractSelectedActionCodes(payload) {
    return extractLandActionFields(payload, this.actionFieldPrefix).map(
      (field) => /** @type {string} */ (/** @type {Record<string, unknown>} */ (payload)[field])
    )
  }

  /**
   * @param {object} prevState
   * @param {object} payload
   * @param {Array} actions
   * @param {object} fetchedParcel
   * @returns {object}
   */
  writeActionsToState(prevState, payload, actions, fetchedParcel) {
    return addActionsToExistingState(prevState, payload, this.actionFieldPrefix, actions, fetchedParcel)
  }
}

// Retained so existing form definitions that reference the previous class name
// by this export still resolve correctly.
export { SelectGroupedActionsPageController as SelectLandActionsPageController }

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
