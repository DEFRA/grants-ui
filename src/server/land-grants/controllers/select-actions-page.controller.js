import SelectActionsBasePageController from '~/src/server/land-grants/controllers/select-actions-base-page.controller.js'
import {
  mapActionsToViewModel,
  getPageConsents,
  getChosenAreaFieldsHtml,
  getParcelSummaryList
} from '~/src/server/land-grants/view-models/select-actions.view-model.js'
import {
  addSelectedActionsToState,
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
import { requiresQuantityInput } from '~/src/shared/action-quantity-type.js'

/**
 * Builds plannedActions for every checked action from its own landActionQuantity_<code>
 * field - a real, user-typed value for a quantity action, or a hidden field
 * the client keeps in sync with its live chosen area otherwise.
 * @param {object} payload
 * @param {Array} actions
 * @returns {PlannedAction[]}
 */
function buildPlannedActionsFromFields(payload, actions) {
  const selectedCodes = new Set(getSelectedActionCodes(payload))
  return actions.flatMap((action) => {
    if (!selectedCodes.has(action.code)) {
      return []
    }
    const quantity = Number(payload[getActionQuantityFieldName(action.code)])
    return Number.isFinite(quantity) && quantity > 0
      ? [{ actionCode: action.code, quantity, unit: action.availableArea?.unit }]
      : []
  })
}

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
   * @param {boolean} [hasErrors] - Whether this page load is redisplaying a rejected submission
   * @param {{ sheetId?: string, parcelId?: string, size?: Size }} [parcel] - Identifiers and area for the
   *   "Selected land parcel" summary
   * @returns {object}
   */
  getViewModelWithActions(
    request,
    context,
    actions,
    addedActions,
    quantityErrorsByCode = {},
    hasErrors = false,
    parcel = {}
  ) {
    const selectLandParcelPath = this.getHref(this.getPreviousPagePath())
    return {
      ...super.getViewModel(request, context),
      actionFieldName: this.actionFieldName,
      addedActions,
      actionItems: mapActionsToViewModel(actions, addedActions, quantityErrorsByCode, hasErrors),
      chosenAreaFieldsHtml: getChosenAreaFieldsHtml(actions, addedActions),
      pageConsents: getPageConsents(actions),
      selectLandParcelPath,
      parcelSummaryList: getParcelSummaryList(parcel.sheetId, parcel.parcelId, parcel.size)
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
    const selectedCodes = getSelectedActionCodes(payload)
    return selectedCodes.flatMap((code) => {
      const actionInfo = actions.find((a) => a.code === code)
      if (!actionInfo) {
        return []
      }
      return [{ code, description: actionInfo.description, value: payload[getActionQuantityFieldName(code)] ?? '' }]
    })
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
   * Recomputes availableArea for every action against the quantity claims
   * in this same submission.
   * @param {AnyFormRequest} request
   * @param {{ selectedLandParcel: string, sheetId: string, parcelId: string }} parcel
   * @param {object} payload
   * @param {Array} actions
   * @returns {Promise<Array>}
   */
  async recomputeActionsForState(request, parcel, payload, actions) {
    const plannedActions = buildPlannedActionsFromFields(payload, actions)
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

    // Self-competing contract: a non-quantity action's own claim is what was
    // just sent, not the response's own-claim-excluded headroom. Skipped for
    // quantity actions - their conditional's max/hint needs the true headroom.
    const sentByCode = new Map(plannedActions.map((p) => [p.actionCode, p.quantity]))
    const actionsByCode = new Map(actions.map((a) => [a.code, a]))
    const withSentClaim = recomputed.map((action) => {
      const needsQuantity = requiresQuantityInput(actionsByCode.get(action.code)?.metadata?.availableAreaType)
      return sentByCode.has(action.code) && !needsQuantity
        ? { ...action, availableArea: { ...action.availableArea, value: sentByCode.get(action.code) } }
        : action
    })

    return mergeRecomputedAvailability(actions, withSentClaim)
  }
}

/**
 * @import { FormContext, AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { PlannedAction, Size } from '~/src/server/land-grants/types/land-grants.client.d.js'
 */
