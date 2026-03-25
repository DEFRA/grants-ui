/**
 * Derive which consent types are required based on the actions selected across all land parcels.
 * @param {object} state
 * @returns {string[]}
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
