import { toParcelData } from './parcel-features.js'
import { formatParcelReference } from '~/src/shared/format-parcel.js'
import { getAddedActionsForStateParcel } from '~/src/server/land-grants/view-state/land-parcel.view-state.js'

// Matches the map's AREA_DECIMAL_PLACES/TOTAL_AREA_DECIMAL_PLACES so both views agree.
const AREA_DECIMAL_PLACES = 4

/**
 * Basic parcel information for the list, with no action or consent calculation.
 * @param {import('./types.js').HydratedParcel[]} hydratedParcels
 * @param {object} state
 */
export function buildParcelList(hydratedParcels, state) {
  const parcels = toParcelData(hydratedParcels)
    .map((parcel) => ({
      ...parcel,
      reference: formatParcelReference(parcel.id),
      area: parcel.areaHa == null ? 'Not available' : `${parcel.areaHa.toFixed(AREA_DECIMAL_PLACES)} ha`,
      added: getAddedActionsForStateParcel(state, parcel.id).length > 0
    }))
    .sort((a, b) => a.reference.localeCompare(b.reference, 'en', { numeric: true }))
  const totalArea = parcels.reduce((sum, parcel) => sum + (parcel.areaHa ?? 0), 0).toFixed(AREA_DECIMAL_PLACES)
  return { parcels, totalArea }
}
