/**
 * Maps land action data to view models for rendering on the select-actions page.
 * Handles transformation of action objects into checkbox items, including the
 * conditional quantity input for actions that require it.
 */

import nunjucks from 'nunjucks'
import { govukFrontendPath, viewPaths } from '~/src/config/nunjucks/view-paths.js'
import { getActionQuantityFieldName } from '~/src/shared/action-quantity-field.js'
import { formatAreaUnit } from '~/src/shared/format-area-unit.js'
import { SELECTED_ACTIONS_FIELD_NAME } from '~/src/server/land-grants/utils/selected-actions-field.js'
import { getConsentTypes } from '~/src/server/land-grants/utils/consent-types.js'

// Built in JS, not the template: Nunjucks can't mutate array items in a loop.
// Own Environment (not the app-wide one) since that one's config.get('root')
// call at import time isn't mocked in this page's controller test.
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
 * First item must be exactly SELECTED_ACTIONS_FIELD_NAME (no suffix) - that's
 * what "no action selected" error-summary links anchor to.
 * @param {string} actionCode
 * @param {boolean} isFirst
 * @returns {string}
 */
function getCheckboxItemId(actionCode, isFirst) {
  return isFirst ? SELECTED_ACTIONS_FIELD_NAME : `${SELECTED_ACTIONS_FIELD_NAME}-${actionCode}`
}

/**
 * Consent type keys (from the feature-flagged getConsentTypes registry) that
 * apply to this action - same membership check buildActionStateEntry and
 * createGroup already use, so a disabled consent feature flag hides this
 * action's requirement text too, not just the persisted state/group hint.
 * @param {Action} action
 * @returns {string[]}
 */
function getActionConsentKeys(action) {
  return getConsentTypes()
    .filter((ct) => action[ct.apiField])
    .map((ct) => ct.key)
}

const CONSENT_LABELS = { sssi: 'SSSI consent', hefer: 'an SFI HEFER' }

/**
 * @param {string[]} consentKeys
 * @returns {string}
 */
function getRequirementText(consentKeys) {
  if (!consentKeys.length) {
    return ''
  }
  const labels = consentKeys.map((key) => CONSENT_LABELS[key])
  return `Requires ${labels.join(' and ')}`
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
  const checked = Boolean(existingAction)
  const consents = getActionConsentKeys(action)
  const requirementText = getRequirementText(consents)
  const agreementRateText = action.ratePerAgreementPerYearGbp
    ? ` and <strong>£${action.ratePerAgreementPerYearGbp}</strong> per agreement`
    : ''
  const requirementLineText = requirementText ? `<br>${requirementText}` : ''
  const hintText = `Payment rate per year: £${action.ratePerUnitGbp?.toFixed(2)}/ha${agreementRateText}${requirementLineText}`

  return {
    id: getCheckboxItemId(action.code, isFirst),
    value: action.code,
    html: `${action.description}<span class="select-actions-hint">${hintText}</span>`,
    checked,
    consents,
    attributes: {
      'data-available-unit': action.availableArea?.unit,
      // Set once here, never touched by the client - the full amount this
      // action needs to remain usable at all (a non-quantity action can't
      // take a partial amount, so this is its pass/fail threshold).
      'data-total-available-area': action.availableArea?.value
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
 * The union of consent type keys required by at least one action on the
 * page, e.g. ['sssi', 'hefer'] - drives the shared intro banner. Same
 * key format as ActionGroup.consents/Action.consents elsewhere.
 * @param {Array<Action>} actions
 * @returns {string[]}
 */
export function getPageConsents(actions) {
  return [...new Set(actions.flatMap((action) => getActionConsentKeys(action)))]
}

/**
 * A 0-available action is dropped from the initial render, unless it was
 * already saved to a previous selection - a saved choice must never silently
 * disappear from the page.
 * @param {Action} action
 * @param {Array<{code: string}>} addedActions
 * @returns {boolean}
 */
function isVisibleOnInitialLoad(action, addedActions) {
  if (action.availableArea?.value !== 0) {
    return true
  }
  return addedActions.some((a) => a.code === action.code)
}

/**
 * Maps a flat list of actions to view models for rendering
 * @param {Array<Action>} actions - Flat array of actions
 * @param {Array<{code: string, description: string}>} addedActions - Actions already added to the parcel
 * @param {Record<string, string>} [quantityErrorsByCode] - Quantity validation error text, keyed by action code
 * @returns {Array<CheckboxItem>} Flat array of mapped action checkboxes
 */
export function mapActionsToViewModel(actions, addedActions, quantityErrorsByCode = {}) {
  const visibleActions = actions.filter((action) => isVisibleOnInitialLoad(action, addedActions))
  return visibleActions.map((action, index) =>
    mapActionToViewModel(action, addedActions, quantityErrorsByCode, index === 0)
  )
}

/**
 * @import { Action, CheckboxItem } from '~/src/server/land-grants/types/select-actions-view-model.d.js'
 */
