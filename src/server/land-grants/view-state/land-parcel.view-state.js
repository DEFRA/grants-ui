import { stringifyParcel } from '~/src/server/land-grants/utils/format-parcel.js'
import { getConsentTypes } from '../utils/consent-types.js'

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
      actionsObj[actionCode] = {
        description: actionInfo.description,
        consents: getConsentTypes()
          .filter((ct) => actionInfo[ct.apiField])
          .map((ct) => ct.key),
        value: actionInfo?.availableArea?.value ?? '',
        unit: actionInfo?.availableArea?.unit ?? ''
      }
    }
  }

  return buildNewState(state, actionsObj, parcel)
}

/**
 * Determine which consents are required based on state
 * @param {object} state - Current state
 * @returns {Array<string>} - Array of required consent types (e.g., ['sssi', 'hefer'])
 */
export function getRequiredConsents(state) {
  if (!state.landParcels || Object.keys(state.landParcels).length === 0) {
    return []
  }

  const allConsents = Object.values(state.landParcels)
    .flatMap((parcel) => Object.values(parcel.actionsObj || {}))
    .flatMap((action) => action.consents || [])

  return [...new Set(allConsents)]
}

/**
 * Extract added actions from state for a specific parcel
 * @param {object} state - Current state
 * @param {string} selectedLandParcel - The selected land parcel ID (format: "sheetId-parcelId")
 * @returns {Array<{code: string, description: string}>} - Array of added actions
 */
export function getAddedActionsForStateParcel(state, selectedLandParcel) {
  const addedActions = []
  const parcelData = state.landParcels?.[selectedLandParcel]?.actionsObj

  if (parcelData) {
    Object.keys(parcelData).forEach((code) => {
      addedActions.push({
        code,
        description: parcelData[code].description
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
    delete newState.draftApplicationAnnualTotalPence
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
      delete newState.draftApplicationAnnualTotalPence
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
 * @property {string[]} [consents] - Array of consent type keys required (e.g., ['sssi', 'hefer'])
 * @property {object} [availableArea] - Available area for the action
 * @property {string|number} [availableArea.value] - Area value (number from API, converted to string in state)
 * @property {string} [availableArea.unit] - Area unit
 */
