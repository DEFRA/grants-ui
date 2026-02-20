/**
 * Maps land action data to view models for rendering in forms.
 * Handles transformation of action objects into checkbox/form items with hints.
 */

const SSSI_CONSENT_LINK =
  './fptt-information#sec-10-get-all-necessary-regulatory-consents-permissions-and-licences-in-place'
const HEFER_LINK = './fptt-information#section-5.5'

/**
 * Returns the consent hint HTML for an action group on the select-actions page.
 * @param {string[]} consents
 * @param {number} actionCount - Number of actions in the group
 * @returns {string|null}
 */
function getGroupConsentHint(consents, actionCount) {
  if (!consents || consents.length === 0) {
    return null
  }

  const hasSssi = consents.includes('sssi')
  const hasHefer = consents.includes('hefer')
  const actionText = actionCount === 1 ? 'this action' : 'these actions'

  if (hasSssi && hasHefer) {
    return `<p class="govuk-body">You must have <a class="govuk-link" rel="noreferrer noopener" target="_blank" href="${SSSI_CONSENT_LINK}">SSSI consent (opens in new tab)</a> and get a <a class="govuk-link" rel="noreferrer noopener" target="_blank" href="${HEFER_LINK}">HEFER (opens in new tab)</a> to do ${actionText} on this land parcel.</p>`
  }

  if (hasSssi) {
    return `<p class="govuk-body">You must have <a class="govuk-link" rel="noreferrer noopener" target="_blank" href="${SSSI_CONSENT_LINK}">SSSI consent (opens in new tab)</a> to do ${actionText} on this land parcel.</p>`
  }

  if (hasHefer) {
    return `<p class="govuk-body">You must get a <a class="govuk-link" rel="noreferrer noopener" target="_blank" href="${HEFER_LINK}">HEFER (opens in new tab)</a> to do ${actionText} on this land parcel.</p>`
  }

  return null
}

/**
 * Maps a single action to a checkbox item view model
 * @param {Action} action - The action to map
 * @param {Array<{code: string, description: string}>} addedActions - Actions already added to the parcel
 * @returns {CheckboxItem} View model for a single checkbox item
 */
export function mapActionToViewModel(action, addedActions) {
  const existingActions = addedActions.map((a) => a.code)
  return {
    value: action.code,
    text: action.description,
    checked: existingActions.includes(action.code),
    hint: {
      html:
        `Payment rate per year: <strong>£${action.ratePerUnitGbp?.toFixed(2)} per hectare</strong>` +
        (action.ratePerAgreementPerYearGbp
          ? ` and <strong>£${action.ratePerAgreementPerYearGbp}</strong> per agreement`
          : '')
    }
  }
}

/**
 * Maps grouped actions to view models for rendering
 * @param {Array<ActionGroup>} groupedActions - Array of action groups
 * @param {Array<{code: string, description: string}>} addedActions - Actions already added to the parcel
 * @returns {Array<GroupViewModel>} Array of action groups with mapped actions
 */
export function mapGroupedActionsToViewModel(groupedActions, addedActions) {
  return groupedActions.map((group) => ({
    ...group,
    consentHint: getGroupConsentHint(group.consents, group.actions.length),
    actions: group.actions.map((action) => mapActionToViewModel(action, addedActions))
  }))
}

/**
 * @typedef {object} Action
 * @property {string} code - Action code
 * @property {string} description - Action description
 * @property {number} [ratePerUnitGbp] - Payment rate per unit in GBP
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
 * @property {string} value - Checkbox value
 * @property {string} text - Checkbox label
 * @property {boolean} checked - Whether checkbox is checked
 * @property {object} hint - Hint text configuration
 * @property {string} hint.html - HTML content for hint
 */

/**
 * @typedef {object} GroupViewModel
 * @property {string} name - Group name
 * @property {Array<CheckboxItem>} actions - Mapped action checkboxes
 */
