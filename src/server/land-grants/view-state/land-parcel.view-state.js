import { stringifyParcel } from '~/src/shared/format-parcel.js'
import { getConsentTypes } from '../utils/consent-types.js'
import { getActionQuantityFieldName } from '~/src/shared/action-quantity-field.js'
import { getSelectedActionCodes } from '../utils/selected-actions-field.js'
import { requiresQuantityInput } from '~/src/shared/action-quantity-type.js'

/**
 * Manages state operations for land parcels and their actions.
 * Centralizes all state manipulation logic for land grants.
 */

/**
 * Build new state by adding actions to a parcel
 * @param {object} state - The current state object
 * @param {object} actionsObj - The actions object to be added to the state
 * @param {Parcel} parcel - The selected land parcel
 * @returns {object} - Updated state
 */
export function buildNewState(state, actionsObj, parcel) {
  const { parcelId, sheetId } = parcel
  const selectedLandParcel = stringifyParcel({ parcelId, sheetId })

  return {
    ...state,
    landParcels: {
      ...state.landParcels,
      [selectedLandParcel]: { size: parcel.size, actionsObj }
    }
  }
}

/**
 * Whether a quantity-required action has a submitted quantity value.
 * @param {object} payload - Form payload
 * @param {Action} actionInfo - The action's data from the API
 * @returns {boolean}
 */
function hasSubmittedQuantity(payload, actionInfo) {
  const quantityOverride = requiresQuantityInput(actionInfo.metadata?.availableAreaType)
    ? payload[getActionQuantityFieldName(actionInfo.code)]
    : null
  return quantityOverride !== null && quantityOverride !== undefined && quantityOverride !== ''
}

/**
 * Flat-checkbox page only: a submitted 0 means "not confirmed" here, unlike
 * the grouped page where 0 is a valid value.
 * @param {object} payload - Form payload
 * @param {Action} actionInfo - The action's data from the API
 * @returns {boolean}
 */
export function hasSubmittedNonZeroQuantity(payload, actionInfo) {
  if (!hasSubmittedQuantity(payload, actionInfo)) {
    return false
  }
  return Number(payload[getActionQuantityFieldName(actionInfo.code)]) !== 0
}

/**
 * Builds the state entry for a single selected action, applying its submitted
 * quantity override when it requires one, otherwise falling back to its
 * available area. actionInfo must already be recomputed against the full
 * submission, or a non-quantity action's availableArea here is its
 * uncompeted total, not what's left once a sibling's claim is accounted for.
 * @param {object} payload - Form payload
 * @param {Action} actionInfo - The action's data from the API
 * @returns {{ description: string, version: string, consents: string[], value: number, unit: string }}
 */
function buildActionStateEntry(payload, actionInfo) {
  const hasQuantityOverride = hasSubmittedQuantity(payload, actionInfo)

  return {
    description: actionInfo.description,
    version: actionInfo.version,
    consents: getConsentTypes()
      .filter((ct) => actionInfo[ct.apiField])
      .map((ct) => ct.key),
    value: Number(
      hasQuantityOverride
        ? payload[getActionQuantityFieldName(actionInfo.code)]
        : (actionInfo?.availableArea?.value ?? 0)
    ),
    unit: actionInfo?.availableArea?.unit ?? ''
  }
}

/**
 * Overlays freshly recomputed availableArea (keyed by code, from
 * fetchActionsWithPlannedActions) onto the full action list from the initial
 * fetch - everything else (description, version, consents, metadata, etc.)
 * still comes from the original fetch, and an action missing from the
 * recompute keeps its original values. The action's first-seen availableArea
 * is preserved as staticAvailableArea, since the recomputed value competes
 * against whatever else is in this submission (see mapActionToViewModel).
 * @param {Array<Action>} actions - Flat list from the initial fetch
 * @param {Array<{ code: string, availableArea?: object }>} recomputed
 * @returns {Array<Action>}
 */
export function mergeRecomputedAvailability(actions, recomputed) {
  const recomputedByCode = new Map(recomputed.map((action) => [action.code, action]))

  return actions.map((action) => {
    const match = recomputedByCode.get(action.code)
    return match
      ? {
          ...action,
          availableArea: match.availableArea,
          staticAvailableArea: action.staticAvailableArea ?? action.availableArea
        }
      : action
  })
}

/**
 * Shared write path behind addActionsToExistingState (grouped) and
 * addSelectedActionsToState (flat): resolve each selected code's actionInfo,
 * keep only confirmed selections, build state entries, and write to state.
 * @param {object} state - Current state
 * @param {object} payload - Form payload containing action selections
 * @param {string[]} selectedCodes - Action codes the user selected
 * @param {Array<Action>} actions - Available actions, flat
 * @param {Parcel} parcel - The selected land parcel
 * @param {(actionInfo: Action, payload: object) => boolean} isConfirmedSelection
 * @returns {object} - Updated state or empty object if no actions selected
 */
function writeSelectedActionsToState(state, payload, selectedCodes, actions, parcel, isConfirmedSelection) {
  if (selectedCodes.length === 0) {
    return {}
  }

  const actionsObj = {}

  for (const actionCode of selectedCodes) {
    const actionInfo = actions.find((a) => a.code === actionCode)
    if (actionInfo && isConfirmedSelection(actionInfo, payload)) {
      actionsObj[actionCode] = buildActionStateEntry(payload, actionInfo)
    }
  }

  return buildNewState(state, actionsObj, parcel)
}

/**
 * Adds parcel actions to an existing state based on payload. Every selection
 * with matching actionInfo is confirmed - a grouped radio has no separate
 * "unconfirmed" state, unlike the flat page's 0-quantity case.
 * @param {object} state - Current state
 * @param {object} payload - Form payload containing action selections
 * @param {string} actionFieldPrefix - Prefix for action field names
 * @param {Array<ActionGroup>} groupedActions - Available actions grouped
 * @param {Parcel} parcel - The selected land parcel
 * @returns {object} - Updated state or empty object if no actions selected
 */
export function addActionsToExistingState(state, payload, actionFieldPrefix, groupedActions, parcel) {
  const landActionFields = Object.keys(payload).filter((key) => key.startsWith(actionFieldPrefix))
  const selectedCodes = landActionFields.map((fieldName) => payload[fieldName]).filter(Boolean)
  const actions = groupedActions.flatMap((g) => g.actions)

  return writeSelectedActionsToState(state, payload, selectedCodes, actions, parcel, () => true)
}

/**
 * Adds selected actions to an existing state, for the select-actions page's flat
 * checkbox layout where every action shares one field name rather than a field
 * per action (see getSelectedActionCodes). A quantity-required action needs a
 * submitted non-zero quantity to count as confirmed; a 0 or missing value doesn't.
 * @param {object} state - Current state
 * @param {object} payload - Form payload containing action selections
 * @param {Array<Action>} actions - Available actions, flat
 * @param {Parcel} parcel - The selected land parcel
 * @returns {object} - Updated state or empty object if no actions selected
 */
export function addSelectedActionsToState(state, payload, actions, parcel) {
  const selectedCodes = getSelectedActionCodes(payload)

  return writeSelectedActionsToState(
    state,
    payload,
    selectedCodes,
    actions,
    parcel,
    (actionInfo, formPayload) =>
      !requiresQuantityInput(actionInfo.metadata?.availableAreaType) ||
      hasSubmittedNonZeroQuantity(formPayload, actionInfo)
  )
}

/**
 * Builds addedActions-shaped entries from a just-submitted payload, so a
 * validation error re-renders with what the user typed. A non-quantity
 * action has no payload field to carry its chosen area, so it falls back to
 * its previous state value instead of an empty amount.
 * @param {object} payload - Form payload containing action selections
 * @param {Array<Action>} actions - Available actions, flat
 * @param {Array<{code: string, value?: string|number}>} [prevAddedActions] - Previously confirmed added actions, from state
 * @returns {Array<{code: string, description: string, value?: string|number}>}
 */
export function getAddedActionsFromPayload(payload, actions, prevAddedActions = []) {
  const selectedCodes = getSelectedActionCodes(payload)

  return selectedCodes
    .map((actionCode) => actions.find((a) => a.code === actionCode))
    .filter((actionInfo) => actionInfo != null)
    .map((actionInfo) => ({
      code: actionInfo.code,
      description: actionInfo.description,
      value: requiresQuantityInput(actionInfo.metadata?.availableAreaType)
        ? (payload[getActionQuantityFieldName(actionInfo.code)] ?? '')
        : (prevAddedActions.find((a) => a.code === actionInfo.code)?.value ?? '')
    }))
}

/**
 * Extract added actions from state for a specific parcel
 * @param {object} state - Current state
 * @param {string} selectedLandParcel - The selected land parcel ID (format: "sheetId-parcelId")
 * @returns {Array<{code: string, description: string, value?: string|number}>} - Array of added actions
 */
export function getAddedActionsForStateParcel(state, selectedLandParcel) {
  const addedActions = []
  const parcelData = state.landParcels?.[selectedLandParcel]?.actionsObj

  if (parcelData) {
    Object.keys(parcelData).forEach((code) => {
      addedActions.push({
        code,
        description: parcelData[code].description,
        value: parcelData[code].value
      })
    })
  }

  return addedActions
}

/**
 * Delete an entire parcel from state and clean up related data
 * @param {object} state - Current state
 * @param {string} parcel - Parcel key (format: "sheetId-parcelId")
 * @returns {object} - Updated state
 */
export function deleteParcelFromState(state, parcel) {
  const newState = structuredClone(state)
  delete newState.landParcels[parcel]

  // Remove the land parcels key if it is empty
  if (Object.keys(newState.landParcels || {}).length === 0) {
    delete newState.landParcels
    delete newState.payment
    delete newState.totalPence
    delete newState.totalPayment
  }

  return newState
}

/**
 * Delete a specific action from a parcel and clean up empty parcels
 * @param {object} state - Current state
 * @param {string} parcel - Parcel key (format: "sheetId-parcelId")
 * @param {string} action - Action code to remove
 * @returns {object} - Updated state
 */
export function deleteActionFromState(state, parcel, action) {
  const newState = structuredClone(state)

  if (newState.landParcels[parcel]?.actionsObj) {
    delete newState.landParcels[parcel].actionsObj[action]

    // Remove parcel if no actions remain
    if (Object.keys(newState.landParcels[parcel].actionsObj).length === 0) {
      delete newState.landParcels[parcel]
    }

    // Remove the land parcels key if it is empty
    if (Object.keys(newState.landParcels || {}).length === 0) {
      delete newState.landParcels
      delete newState.payment
      delete newState.totalPence
      delete newState.totalPayment
    }
  }

  return newState
}

/**
 * Check if state has any land parcels
 * @param {object} state - Current state
 * @returns {boolean} - True if land parcels exist
 */
export function hasLandParcels(state) {
  return Object.keys(state.landParcels || {}).length > 0
}

/**
 * Find action information from land parcels state
 * @param {object} landParcels - Land parcels from state
 * @param {string} parcelKey - Parcel key
 * @param {string} action - Action code
 * @returns {object|null} - Action information or null if not found
 */
export function findActionInfoFromState(landParcels, parcelKey, action) {
  const landParcel = landParcels[parcelKey]
  return landParcel?.actionsObj?.[action] || null
}

/**
 * @typedef {object} Parcel
 * @property {string} parcelId - The parcel identifier
 * @property {string} sheetId - The sheet identifier
 * @property {object} [size] - The size of the parcel
 * @property {number} [size.value] - Size value
 * @property {string} [size.unit] - Size unit
 */

/**
 * @typedef {object} ActionGroup
 * @property {string} name - Group name
 * @property {Array<Action>} actions - Actions in the group
 */

/**
 * @typedef {object} Action
 * @property {string} code - Action code
 * @property {string} description - Action description
 * @property {string} version - Action version
 * @property {string[]} [consents] - Array of consent type keys required (e.g., ['sssi', 'hefer'])
 * @property {object} [metadata] - Additional action metadata
 * @property {'total'|'partial'|'limited'} [metadata.availableAreaType] - Whether this action
 *   needs a user-typed quantity (see requiresQuantityInput in shared/action-quantity-type.js)
 * @property {object} [availableArea] - Available area for the action
 * @property {number} [availableArea.value] - Area value
 * @property {string} [availableArea.unit] - Area unit
 * @property {object} [staticAvailableArea] - The action's original, uncompeted available area (see mergeRecomputedAvailability)
 * @property {number} [staticAvailableArea.value] - Area value
 * @property {string} [staticAvailableArea.unit] - Area unit
 */
