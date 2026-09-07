const CONFIRM_LAND_AND_ACTIONS_ORIGIN = 'confirm-land-and-actions'

export const CONFIRM_LAND_AND_ACTIONS_PATH = '/confirm-land-and-actions'

/**
 * Marks a link as originating from the confirm land and actions page. The
 * optional change-actions marker distinguishes its direct action links from a
 * trip through the parcel picker.
 *
 * @param {string} href
 * @param {{ changeActions?: boolean }} [options]
 * @returns {string}
 */
export function withConfirmLandAndActionsOrigin(href, { changeActions = false } = {}) {
  const separator = href.includes('?') ? '&' : '?'
  const changeActionsQuery = changeActions ? '&changeActions=true' : ''
  return `${href}${separator}origin=${CONFIRM_LAND_AND_ACTIONS_ORIGIN}${changeActionsQuery}`
}

/** @param {AnyFormRequest} request */
export const isFromConfirmLandAndActions = (request) => request?.query?.origin === CONFIRM_LAND_AND_ACTIONS_ORIGIN

/** @param {AnyFormRequest} request */
export const isChangingActionsFromConfirmLandAndActions = (request) =>
  isFromConfirmLandAndActions(request) && request?.query?.changeActions === 'true'

/**
 * @import { AnyFormRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
