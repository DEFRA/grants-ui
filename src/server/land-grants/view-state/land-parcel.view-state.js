import { stringifyParcel } from '~/src/shared/format-parcel.js'
import { getConsentTypes } from '../utils/consent-types.js'
import { getActionQuantityFieldName } from '~/src/shared/action-quantity-field.js'
import { getSelectedActionCodes } from '../utils/selected-actions-field.js'

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
  const quantityOverride =
    actionInfo.requiresMaxQuantity != null ? payload[getActionQuantityFieldName(actionInfo.code)] : null
  return quantityOverride !== null && quantityOverride !== undefined && quantityOverride !== ''
}

/**
 * Whether a quantity-required action has a submitted, non-zero quantity -
 * used only by the flat-checkbox select-actions page, where a submitted 0
 * means "not confirmed". Not shared with addActionsToExistingState (the
 * grouped page), which treats a genuine 0 as a valid value.
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
 * quantity override when it requires one and one was submitted, otherwise
 * falling back to its full available area.
 * @param {object} payload - Form payload
 * @param {Action} actionInfo - The action's data from the API
 * @returns {{ description: string, version: string, consents: string[], value: string|number, unit: string }}
 */
function buildActionStateEntry(payload, actionInfo) {
  const hasQuantityOverride = hasSubmittedQuantity(payload, actionInfo)

  return {
    description: actionInfo.description,
    version: actionInfo.version,
    consents: getConsentTypes()
      .filter((ct) => actionInfo[ct.apiField])
      .map((ct) => ct.key),
    value: hasQuantityOverride
      ? payload[getActionQuantityFieldName(actionInfo.code)]
      : (actionInfo?.availableArea?.value ?? ''),
    unit: actionInfo?.availableArea?.unit ?? ''
  }
}

/**
 * Adds parcel actions to an existing state based on payload
 * @param {object} state - Current state
 * @param {object} payload - Form payload containing action selections
 * @param {string} actionFieldPrefix - Prefix for action field names
 * @param {Array<ActionGroup>} groupedActions - Available actions grouped
 * @param {Parcel} parcel - The selected land parcel
 * @returns {object} - Updated state or empty object if no actions selected
 */
export function addActionsToExistingState(state, payload, actionFieldPrefix, groupedActions, parcel) {
  // Extract action fields from payload
  const landActionFields = Object.keys(payload).filter((key) => key.startsWith(actionFieldPrefix))

  if (landActionFields.length === 0) {
    return {}
  }

  const actionsObj = {}
  const allActions = groupedActions.flatMap((g) => g.actions)

  for (const fieldName of landActionFields) {
    const actionCode = payload[fieldName]
    const actionInfo = allActions.find((a) => a.code === actionCode)
    if (actionCode && actionInfo) {
      actionsObj[actionCode] = buildActionStateEntry(payload, actionInfo)
    }
  }

  return buildNewState(state, actionsObj, parcel)
}

/**
 * Adds selected actions to an existing state, for the select-actions page's flat
 * checkbox layout where every action shares one field name rather than a field
 * per action (see getSelectedActionCodes).
 * @param {object} state - Current state
 * @param {object} payload - Form payload containing action selections
 * @param {Array<ActionGroup>} groupedActions - Available actions grouped
 * @param {Parcel} parcel - The selected land parcel
 * @returns {object} - Updated state or empty object if no actions selected
 */
export function addSelectedActionsToState(state, payload, groupedActions, parcel) {
  const selectedCodes = getSelectedActionCodes(payload)

  if (selectedCodes.length === 0) {
    return {}
  }

  const actionsObj = {}
  const allActions = groupedActions.flatMap((g) => g.actions)

  for (const actionCode of selectedCodes) {
    const actionInfo = allActions.find((a) => a.code === actionCode)
    // Skip actions that don't exist, or quantity-required actions with no
    // confirmed (non-zero) quantity - matching the page's live-refresh
    // behaviour, an unconfirmed quantity means "not chosen".
    const isConfirmedSelection =
      actionInfo && (actionInfo.requiresMaxQuantity == null || hasSubmittedNonZeroQuantity(payload, actionInfo))
    if (isConfirmedSelection) {
      actionsObj[actionCode] = buildActionStateEntry(payload, actionInfo)
    }
  }

  return buildNewState(state, actionsObj, parcel)
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
 * @property {number} [requiresMaxQuantity] - If set, the user must enter a quantity for this action, capped at this value
 * @property {object} [availableArea] - Available area for the action
 * @property {string|number} [availableArea.value] - Area value (number from API, converted to string in state)
 * @property {string} [availableArea.unit] - Area unit
 */
