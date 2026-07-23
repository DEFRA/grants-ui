/**
 * Maps land action data to view models for rendering on the select-actions page.
 * Handles transformation of action objects into checkbox items, including the
 * conditional quantity input for actions that require it.
 */

import nunjucks from 'nunjucks'
import { govukFrontendPath, viewPaths } from '~/src/config/nunjucks/view-paths.js'
import { getActionQuantityFieldName } from '~/src/server/land-grants/utils/action-quantity-field.js'
import { formatAreaUnit } from '~/src/server/land-grants/utils/format-area-unit.js'
import { SELECTED_ACTIONS_FIELD_NAME } from '~/src/server/land-grants/utils/selected-actions-field.js'

// Built in JS, not the template: Nunjucks can't mutate array items across a loop
// (no namespace(), no {% set item.prop = x %}), and govukCheckboxes needs the full
// conditional.html per item up front.
//
// Own Environment instead of the app-wide one in nunjucks.js: that module's
// nunjucks.configure() runs config.get('root') at import time, which this page's
// controller test doesn't mock.
const QUANTITY_INPUT_TEMPLATE = 'quantity-input/template.njk'
const quantityInputEnv = new nunjucks.Environment(new nunjucks.FileSystemLoader([govukFrontendPath, ...viewPaths]), {
  autoescape: true
})

/**
 * Builds the conditional reveal markup for an action that requires the user to
 * enter a specific quantity, rather than defaulting to the full available area.
 * Rendered through the govukInput macro so GOV.UK Frontend handles escaping.
 * @param {string} actionCode
 * @param {string} actionName
 * @param {string} quantityValue
 * @param {number} maxQuantity
 * @param {string} [unit]
 * @param {string} [errorText] - Error message shown on the input when this action's
 *   quantity failed validation
 * @returns {{ html: string }}
 */
function getQuantityConditional(actionCode, actionName, quantityValue, maxQuantity, unit, errorText) {
  const fieldId = getActionQuantityFieldName(actionCode)
  return {
    html: quantityInputEnv.render(QUANTITY_INPUT_TEMPLATE, {
      fieldId,
      actionName,
      quantityValue,
      maxQuantity,
      unit,
      unitFullName: formatAreaUnit(unit),
      errorText
    })
  }
}

/**
 * Builds the stable, addressable checkbox id for an action. The first item in the
 * rendered list must be exactly SELECTED_ACTIONS_FIELD_NAME (with no suffix) to match
 * govuk-frontend's own default idPrefix behaviour - that's what "no action selected"
 * error-summary links (see validateSelectedActions) anchor to.
 * @param {string} actionCode
 * @param {boolean} isFirst
 * @returns {string}
 */
function getCheckboxItemId(actionCode, isFirst) {
  return isFirst ? SELECTED_ACTIONS_FIELD_NAME : `${SELECTED_ACTIONS_FIELD_NAME}-${actionCode}`
}

/**
 * Maps a single action to a checkbox item view model
 * @param {Action} action - The action to map
 * @param {Array<{code: string, description: string, value?: string}>} addedActions - Actions already added to the parcel
 * @param {Record<string, string>} [quantityErrorsByCode] - Quantity validation error text, keyed by action code
 * @param {boolean} [isFirst] - Whether this is the first item in the rendered list
 * @returns {CheckboxItem} View model for a single checkbox item
 */
export function mapActionToViewModel(action, addedActions, quantityErrorsByCode = {}, isFirst = false) {
  const existingAction = addedActions.find((a) => a.code === action.code)
  const quantityValue = existingAction?.value ?? ''

  return {
    id: getCheckboxItemId(action.code, isFirst),
    value: action.code,
    text: action.description,
    checked: Boolean(existingAction),
    hint: {
      html:
        `Payment rate per year: £${action.ratePerUnitGbp?.toFixed(2)}/ha` +
        (action.ratePerAgreementPerYearGbp
          ? ` and <strong>£${action.ratePerAgreementPerYearGbp}</strong> per agreement`
          : '')
    },
    ...(action.requiresMaxQuantity != null && {
      conditional: getQuantityConditional(
        action.code,
        action.description,
        quantityValue,
        action.requiresMaxQuantity,
        action.availableArea?.unit,
        quantityErrorsByCode[action.code]
      )
    })
  }
}

/**
 * Maps grouped actions to a flat list of view models for rendering
 * @param {Array<ActionGroup>} groupedActions - Array of action groups
 * @param {Array<{code: string, description: string}>} addedActions - Actions already added to the parcel
 * @param {Record<string, string>} [quantityErrorsByCode] - Quantity validation error text, keyed by action code
 * @returns {Array<CheckboxItem>} Flat array of mapped action checkboxes
 */
export function mapGroupedActionsToViewModel(groupedActions, addedActions, quantityErrorsByCode = {}) {
  const allActions = groupedActions.flatMap((group) => group.actions)
  return allActions.map((action, index) =>
    mapActionToViewModel(action, addedActions, quantityErrorsByCode, index === 0)
  )
}

/**
 * @typedef {object} Action
 * @property {string} code - Action code
 * @property {string} description - Action description
 * @property {string} version - Action version
 * @property {number} [ratePerUnitGbp] - Payment rate per unit in GBP
 * @property {boolean} [sssiConsentRequired] - Action requires SSSI consent
 * @property {boolean} [heferRequired] - Action requires HEFER
 * @property {number} [requiresMaxQuantity] - If set, the user must enter a quantity for this action, capped at this value
 * @property {number} [ratePerAgreementPerYearGbp] - Additional payment per agreement per year
 * @property {object} [availableArea] - Available area for the action
 * @property {string} [availableArea.value] - Area value
 * @property {string} [availableArea.unit] - Area unit
 */

/**
 * @typedef {object} ActionGroup
 * @property {string} name - Group name
 * @property {Array<string>} consents - Array of consents for the group
 * @property {Array<Action>} actions - Actions in the group
 */

/**
 * @typedef {object} CheckboxItem
 * @property {string} id - Explicit, stable checkbox id (used for error-summary anchors, since
 *   all actions share one checkbox `name` and GOV.UK's positional auto-id isn't addressable
 *   by action code)
 * @property {string} value - Checkbox value
 * @property {string} text - Checkbox label
 * @property {boolean} checked - Whether checkbox is checked
 * @property {object} hint - Hint text configuration
 * @property {string} hint.html - HTML content for hint
 * @property {{ html: string }} [conditional] - Conditional reveal markup shown when checked/selected
 */
