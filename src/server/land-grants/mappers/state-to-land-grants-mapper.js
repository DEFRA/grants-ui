import { parseLandParcel } from '../utils/format-parcel.js'

/**
 * Maps state actions into the expected payload structure for the API.
 * @param {{ landParcels?: LandParcels }} state
 * @returns {LandActions[]}
 */
export const stateToLandActionsMapper = (state = {}) => {
  const { landParcels = {} } = state

  const stateActionsObjectToApiFormat = (actionsObj = {}) =>
    Object.entries(actionsObj).map(([code, area]) => ({
      code,
      quantity: Number(area.value)
    }))

  const landActions = Object.keys(landParcels).map((parcelKey) => {
    const parcel = landParcels[parcelKey]
    const [sheetId, parcelId] = parseLandParcel(parcelKey)
    const actionsObj = parcel.actionsObj || {}

    return { sheetId, parcelId, actions: stateActionsObjectToApiFormat(actionsObj) }
  })

  return landActions
}

/**
 * @import { LandActions } from '~/src/server/land-grants/types/land-grants.client.d.js'
 * @import { LandParcels } from '~/src/server/land-grants/types/form-state.d.js'
 */
