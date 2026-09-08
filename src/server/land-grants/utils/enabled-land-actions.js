/**
 * @param {unknown} enabledLandActions
 * @returns {string[]}
 */
export const normaliseEnabledLandActions = (enabledLandActions = []) =>
  Array.isArray(enabledLandActions)
    ? enabledLandActions
        .filter((action) => typeof action === 'string')
        .map((action) => action.trim())
        .filter(Boolean)
    : []

/**
 * Applies the grant journey's enabled-action filter to actions returned for a
 * parcel by the Land Grants API.
 * @param {ActionOption[]} actions
 * @param {unknown} enabledLandActions
 * @returns {ActionOption[]}
 */
export function filterEnabledLandActions(actions = [], enabledLandActions = []) {
  const enabledActions = new Set(normaliseEnabledLandActions(enabledLandActions))
  return actions.filter((action) => enabledActions.has(action.code))
}

/**
 * @import { ActionOption } from '~/src/server/land-grants/types/land-grants.client.d.js'
 */
