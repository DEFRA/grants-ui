/**
 * Maps land action data to view models for rendering on the select-actions page.
 * Handles transformation of action objects into checkbox items, including the
 * conditional quantity input for actions that require it.
 */

import nunjucks from 'nunjucks'
import { govukFrontendPath, viewPaths } from '~/src/config/nunjucks/view-paths.js'
import { getActionQuantityFieldName } from '~/src/shared/action-quantity-field.js'
import { requiresQuantityInput } from '~/src/shared/action-quantity-type.js'
import { formatAreaUnit } from '~/src/shared/format-area-unit.js'
import { SELECTED_ACTIONS_FIELD_NAME } from '~/src/server/land-grants/utils/selected-actions-field.js'
import { getConsentTypes } from '~/src/server/land-grants/utils/consent-types.js'

const QUANTITY_INPUT_TEMPLATE = 'quantity-input/template.njk'
const ACTION_LABEL_TEMPLATE = 'action-label/template.njk'
const landGrantsViewEnv = new nunjucks.Environment(new nunjucks.FileSystemLoader([govukFrontendPath, ...viewPaths]), {
  autoescape: true
})

/**
 * Builds the conditional reveal markup for an action that requires a user-entered quantity.
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
    html: landGrantsViewEnv.render(QUANTITY_INPUT_TEMPLATE, {
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
 * Builds the checkbox label markup: the action description plus an optional
 * "read guidance" link. Rendered through Nunjucks (autoescape on) so the
 * description and URL are escaped rather than concatenated into raw HTML.
 * @param {string} description
 * @param {string} [guidanceUrl]
 * @returns {string}
 */
function getActionLabelHtml(description, guidanceUrl) {
  return landGrantsViewEnv.render(ACTION_LABEL_TEMPLATE, { description, guidanceUrl })
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
 * An action's original, uncompeted total - availableArea may have been
 * overwritten by a recompute against other actions in this submission (see
 * mergeRecomputedAvailability), which isn't a safe standalone ceiling.
 * @param {Action} action
 * @returns {{ value?: number, unit?: string } | undefined}
 */
function getStaticAvailableArea(action) {
  return action.staticAvailableArea ?? action.availableArea
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
 * Builds the checkbox hint text: payment rate, consent requirement, and -
 * for a non-quantity action only - its own availability. A quantity action's
 * availability hint lives inside its conditional panel instead (see
 * quantity-input/template.njk), kept in sync live by the client.
 * @param {Action} action
 * @param {boolean} needsQuantity
 * @returns {string}
 */
function getHintHtml(action, needsQuantity) {
  const consents = getActionConsentKeys(action)
  const requirementText = getRequirementText(consents)
  const agreementRateText = action.ratePerAgreementPerYearGbp
    ? ` and <strong>£${action.ratePerAgreementPerYearGbp}</strong> per agreement`
    : ''
  const requirementLineText = requirementText ? `<br>${requirementText}` : ''
  const rateText = `Payment rate per year: £${action.ratePerUnitGbp?.toFixed(2)}/ha${agreementRateText}${requirementLineText}`
  const availabilityHintHtml =
    !needsQuantity && action.availableArea
      ? `<br><span id="${getActionQuantityFieldName(action.code)}-hint">${action.availableArea.value} ${formatAreaUnit(action.availableArea.unit)} available</span>`
      : ''
  return `${rateText}${availabilityHintHtml}`
}

/**
 * Maps a single action to a checkbox item view model
 * @param {Action} action - The action to map
 * @param {Array<{code: string, description: string, value?: string}>} addedActions - Actions already added to the parcel
 * @param {Record<string, string>} [quantityErrorsByCode] - Quantity validation error text, keyed by action code
 * @param {boolean} [isFirst] - Whether this is the first item in the rendered list
 * @param {boolean} [hasErrors] - Whether this page load is redisplaying a rejected submission
 * @returns {CheckboxItem} View model for a single checkbox item
 */
export function mapActionToViewModel(
  action,
  addedActions,
  quantityErrorsByCode = {},
  isFirst = false,
  hasErrors = false
) {
  const existingAction = addedActions.find((a) => a.code === action.code)
  const quantityValue = existingAction?.value ?? ''
  const checked = Boolean(existingAction)
  const availableAreaType = action.metadata?.available_area_type
  const needsQuantity = requiresQuantityInput(availableAreaType)
  const hintHtml = getHintHtml(action, needsQuantity)
  const consents = getActionConsentKeys(action)

  return {
    id: getCheckboxItemId(action.code, isFirst),
    value: action.code,
    html: `${getActionLabelHtml(action.description, action.metadata?.guidance_link)}<span class="select-actions-hint">${hintHtml}</span>`,
    checked,
    consents,
    attributes: {
      'data-available-unit': action.availableArea?.unit,
      // A non-quantity action's pass/fail threshold - static, never touched by the client.
      'data-total-available-area': getStaticAvailableArea(action)?.value,
      'data-available-area-type': availableAreaType ?? 'total',
      // Stamped per-checkbox (not a single form-wide flag) so protection survives
      // until THIS action is directly interacted with, not just the first refresh.
      ...(checked && hasErrors && { 'data-error-on-load': 'true' })
    },
    ...(needsQuantity && {
      conditional: getQuantityConditional(
        action.code,
        action.description,
        quantityValue,
        action.availableArea?.value ?? 0,
        action.availableArea?.unit,
        quantityErrorsByCode[action.code]
      )
    })
  }
}

/**
 * A hidden input per non-quantity action, carrying its chosen area for form
 * submission - rendered outside the checkboxes list (not as a conditional
 * reveal, which applies visible box styling even to hidden content).
 * @param {Array<Action>} actions
 * @param {Array<{code: string, value?: string|number}>} addedActions
 * @returns {string}
 */
export function getChosenAreaFieldsHtml(actions, addedActions) {
  return actions
    .filter((action) => !requiresQuantityInput(action.metadata?.available_area_type))
    .map((action) => {
      const fieldName = getActionQuantityFieldName(action.code)
      const chosenArea = Number(addedActions.find((a) => a.code === action.code)?.value)
      const value = Number.isFinite(chosenArea) && chosenArea > 0 ? chosenArea : 0
      return `<input type="hidden" id="${fieldName}" name="${fieldName}" value="${value}">`
    })
    .join('\n')
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
 * already saved to a previous selection - a saved choice must never silently disappear.
 * @param {Action} action
 * @param {Array<{code: string}>} addedActions
 * @returns {boolean}
 */
function isVisibleOnInitialLoad(action, addedActions) {
  if (getStaticAvailableArea(action)?.value !== 0) {
    return true
  }
  return addedActions.some((a) => a.code === action.code)
}

/**
 * Maps a flat list of actions to view models for rendering
 * @param {Array<Action>} actions - Flat array of actions
 * @param {Array<{code: string, description: string}>} addedActions - Actions already added to the parcel
 * @param {Record<string, string>} [quantityErrorsByCode] - Quantity validation error text, keyed by action code
 * @param {boolean} [hasErrors] - Whether this page load is redisplaying a rejected submission
 * @returns {Array<CheckboxItem>} Flat array of mapped action checkboxes
 */
export function mapActionsToViewModel(actions, addedActions, quantityErrorsByCode = {}, hasErrors = false) {
  const visibleActions = actions.filter((action) => isVisibleOnInitialLoad(action, addedActions))
  return visibleActions.map((action, index) =>
    mapActionToViewModel(action, addedActions, quantityErrorsByCode, index === 0, hasErrors)
  )
}

/**
 * @import { Action, CheckboxItem } from '~/src/server/land-grants/types/select-actions-view-model.d.js'
 */
