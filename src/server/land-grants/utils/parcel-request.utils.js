export function getParcelIdFromQuery(request) {
  const parcelId = request?.query?.parcelId
  return parcelId ? [parcelId] : null
}

export function getParcelIdsFromPayload(request) {
  const selectedLandParcel = request.payload?.selectedLandParcel || null
  return selectedLandParcel ? [selectedLandParcel] : null
}
