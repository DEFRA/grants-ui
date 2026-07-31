/**
 * Maps land action data to view models for rendering in forms.
 * Handles transformation of action objects into checkbox/form items with hints.
 */

const SSSI_CONSENT_LINK =
  './fptt-information#sec-10-get-all-necessary-regulatory-consents-permissions-and-licences-in-place'
const HEFER_LINK = './fptt-information#section-5.5'

/**
 * Returns the consent hint data for an action group on the select-actions page.
 * @param {string[]} consents
 * @param {number} actionCount - Number of actions in the group
 * @returns {{ consentType: string, actionText: string, sssiConsentLink?: string, heferLink?: string } | null}
 */
function getGroupConsentHint(consents, actionCount) {
  if (!consents || consents.length === 0) {
    return null
  }

  const hasSssi = consents.includes('sssi')
  const hasHefer = consents.includes('hefer')
  const actionText = actionCount === 1 ? 'this action' : 'these actions'

  if (hasSssi && hasHefer) {
    return {
      consentType: 'all',
      actionText,
      sssiConsentLink: SSSI_CONSENT_LINK,
      heferLink: HEFER_LINK
    }
  }

  if (hasSssi) {
    return {
      consentType: 'sssi',
      actionText,
      sssiConsentLink: SSSI_CONSENT_LINK
    }
  }

  if (hasHefer) {
    return {
      consentType: 'hefer',
      actionText,
      heferLink: HEFER_LINK
    }
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
 * @import { Action, ActionGroup, CheckboxItem, GroupViewModel } from '~/src/server/land-grants/types/select-actions-view-model.d.js'
 */
