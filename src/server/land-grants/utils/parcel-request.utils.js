export function getParcelIdsFromPayload(request) {
  const landParcels = request.payload?.landParcels
  if (!landParcels || landParcels.length === 0) {
    return []
  }

  return Array.isArray(landParcels) ? landParcels : [landParcels]
}

export function getParcelIdFromQuery(request) {
  const parcelId = request?.query?.parcelId
  return parcelId ? [parcelId] : []
}
