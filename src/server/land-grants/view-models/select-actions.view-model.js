/**
 * Maps land action data to view models for rendering on the select-actions page.
 * Handles transformation of action objects into checkbox items, including the
 * conditional quantity input for actions that require it.
 */

import nunjucks from 'nunjucks'
import { govukFrontendPath, viewPaths } from '~/src/config/nunjucks/view-paths.js'
import { getActionChosenAreaDisplayId, getActionQuantityFieldName } from '~/src/shared/action-quantity-field.js'
import { requiresQuantityInput } from '~/src/shared/action-quantity-type.js'
import { formatAreaUnit } from '~/src/shared/format-area-unit.js'
import { formatUnit } from '~/src/shared/format-unit.js'
import { areaWithUnit, availableArea } from '~/src/shared/unit-format.js'
import { getAvailabilityLimit, hasAvailableLand } from '~/src/shared/availability.js'
import { formatParcelReference } from '~/src/shared/format-parcel.js'
import { SELECTED_ACTIONS_FIELD_NAME } from '~/src/server/land-grants/utils/selected-actions-field.js'
import { getActionConsentKeys } from '~/src/server/land-grants/utils/consent-types.js'
import { getConsentRequirementText } from '~/src/server/land-grants/view-models/consent.view-model.js'

const QUANTITY_INPUT_TEMPLATE = 'quantity-input/template.njk'
const CHOSEN_AREA_TEMPLATE = 'chosen-area/template.njk'
const ACTION_LABEL_TEMPLATE = 'action-label/template.njk'
const ACTION_HINT_TEMPLATE = 'action-hint/template.njk'
const landGrantsViewEnv = new nunjucks.Environment(new nunjucks.FileSystemLoader([govukFrontendPath, ...viewPaths]), {
  autoescape: true
})

/**
 * Builds the conditional reveal markup for an action that requires a user-entered quantity.
 * @param {string} actionCode
 * @param {string} actionName
 * @param {string} quantityValue
 * @param {number} [maxQuantity] - Omitted when the action has no availability
 *   restriction, which leaves the input unbounded and with nothing to describe it
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
      errorText
    })
  }
}

/**
 * Builds the conditional reveal markup for a total action: a read-only
 * display of the area it has claimed, since it takes everything available
 * and so has nothing for the user to type. Omitted entirely for an action
 * with no availability restriction at all - there is no figure to show.
 * An unselected action shows what it would claim if selected now, which is
 * what the user sees for the moment before the first live refresh lands.
 * @param {Action} action
 * @param {number} [chosenArea] - Area already claimed by this action, if selected
 * @returns {{ html: string } | undefined}
 */
function getChosenAreaConditional(action, chosenArea) {
  const area = chosenArea ?? getAvailabilityLimit(action.availability)
  if (area == null) {
    return undefined
  }
  return {
    html: landGrantsViewEnv.render(CHOSEN_AREA_TEMPLATE, {
      displayId: getActionChosenAreaDisplayId(action.code),
      areaText: areaWithUnit(area, action.availability?.unit)
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
 * An action's original, uncompeted total - availability may have been
 * overwritten by a recompute against other actions in this submission (see
 * mergeRecomputedAvailability), which isn't a safe standalone ceiling.
 * @param {Action} action
 * @returns {{ value?: number | null, unit?: string } | undefined}
 */
function getStaticAvailability(action) {
  return action.staticAvailability ?? action.availability
}

/**
 * Builds the checkbox hint text: payment rate, consent requirement, and any
 * available-area hint. The hint sits beneath the action label so it can be
 * shared by quantity inputs through aria-describedby and refreshed live by
 * the client. Total actions also include guidance that selecting them claims
 * all available area; their own claim is shown in the conditional panel
 * instead (see chosen-area/template.njk).
 * @param {Action} action
 * @param {boolean} needsQuantity
 * @param {number} [chosenArea]
 * @returns {string}
 */
function getHintHtml(action, needsQuantity, chosenArea) {
  const requirementText = getConsentRequirementText(getActionConsentKeys(action))
  const limit = getAvailabilityLimit(action.availability)
  const availabilityText = needsQuantity
    ? `${limit} ${formatUnit(action.availability?.unit)} available`
    : availableArea(limit ?? 0, action.availability?.unit)
  return landGrantsViewEnv.render(ACTION_HINT_TEMPLATE, {
    rate: String(action.ratePerUnitGbp?.toFixed(2)),
    agreementRate: action.ratePerAgreementPerYearGbp,
    requirementText,
    hintId: `${getActionQuantityFieldName(action.code)}-hint`,
    availabilityText: limit != null || (!needsQuantity && chosenArea != null) ? availabilityText : undefined,
    showTotalGuidance: !needsQuantity
  })
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
  const needsQuantity = requiresQuantityInput(action.availability?.type)
  const claimed = Number(existingAction?.value)
  const chosenArea = Number.isFinite(claimed) && claimed > 0 ? claimed : undefined
  const hintHtml = getHintHtml(action, needsQuantity, chosenArea)
  const consents = getActionConsentKeys(action)
  const conditional = needsQuantity
    ? getQuantityConditional(
        action.code,
        action.description,
        quantityValue,
        getAvailabilityLimit(action.availability),
        action.availability?.unit,
        quantityErrorsByCode[action.code]
      )
    : getChosenAreaConditional(action, chosenArea)

  return {
    id: getCheckboxItemId(action.code, isFirst),
    value: action.code,
    html: `${getActionLabelHtml(action.description, action.guidanceUrl)}<span class="select-actions-hint">${hintHtml}</span>`,
    checked,
    consents,
    attributes: {
      'data-available-unit': action.availability?.unit,
      // A non-quantity action's pass/fail threshold - static, never touched by the client.
      'data-total-available-area': getAvailabilityLimit(getStaticAvailability(action)),
      // Stamped per-checkbox (not a single form-wide flag) so protection survives
      // until THIS action is directly interacted with, not just the first refresh.
      ...(checked && hasErrors && { 'data-error-on-load': 'true' })
    },
    ...(conditional && { conditional })
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
    .filter((action) => !requiresQuantityInput(action.availability?.type))
    .map((action) => {
      const fieldName = getActionQuantityFieldName(action.code)
      const chosenArea = Number(addedActions.find((a) => a.code === action.code)?.value)
      const value = Number.isFinite(chosenArea) && chosenArea > 0 ? chosenArea : 0
      return `<input type="hidden" id="${fieldName}" name="${fieldName}" value="${value}">`
    })
    .join('\n')
}

/**
 * Builds the govukSummaryList rows for the "Selected land parcel" summary card.
 * Land cover isn't fetched yet, so it's omitted.
 * @param {string} sheetId
 * @param {string} parcelId
 * @param {{ value?: number, unit?: string }} [size]
 * @returns {{ rows: Array<{ key: { text: string }, value: { text: string } }> }}
 */
export function getParcelSummaryList(sheetId, parcelId, size) {
  const areaText = size?.value != null ? `${size.value} ${formatAreaUnit(size.unit)}` : ''

  return {
    rows: [
      { key: { text: 'Parcel reference' }, value: { text: formatParcelReference({ sheetId, parcelId }) } },
      { key: { text: 'Total area' }, value: { text: areaText } }
    ]
  }
}

/**
 * A 0-available action is dropped from the initial render, unless it was
 * already saved to a previous selection - a saved choice must never silently disappear.
 * @param {Action} action
 * @param {Array<{code: string}>} addedActions
 * @returns {boolean}
 */
function isVisibleOnInitialLoad(action, addedActions) {
  return hasAvailableLand(action) || addedActions.some((a) => a.code === action.code)
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
