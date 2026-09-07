import { stringifyParcel } from '~/src/shared/format-parcel.js'
import { filterEnabledLandActions } from '~/src/server/land-grants/utils/enabled-land-actions.js'
import { hasAvailableLand } from '~/src/shared/availability.js'

/**
 * Normalises hydrated parcels into the flat shape the map response is built
 * from: the compound "SHEET-PARCEL" id, its two components, and area in
 * hectares (null when the size API supplied none), and the count of enabled
 * actions that have land available.
 * @param {HydratedParcel[]} parcels
 * @param {string[]} enabledLandActions
 * @returns {{ id: string, sheetId: string, parcelId: string, areaHa: number | null, actionCount: number }[]}
 */
export function toParcelData(parcels, enabledLandActions = []) {
  return parcels.map((p) => ({
    id: stringifyParcel(p),
    sheetId: p.sheetId,
    parcelId: p.parcelId,
    areaHa: p.area?.value == null ? null : Number(p.area.value),
    actionCount: filterEnabledLandActions(p.actions ?? [], enabledLandActions).filter(hasAvailableLand).length
  }))
}

/**
 * Real-mode GeoJSON features: properties only, no geometry — the client streams
 * geometry from the parcel-tiles route. `sheet_id`/`parcel_id` are snake_case to
 * mirror the land-grants tile property names.
 * @param {{ id: string, sheetId: string, parcelId: string, areaHa: number | null, actionCount: number }[]} parcelData
 * @returns {ParcelFeature[]}
 */
export function toGeoJsonFeatures(parcelData) {
  return parcelData.map((p) => ({
    type: 'Feature',
    id: p.id,
    properties: {
      id: p.id,
      sheet_id: p.sheetId,
      parcel_id: p.parcelId,
      areaHa: p.areaHa,
      actionCount: p.actionCount
    }
  }))
}

/**
 * @import { HydratedParcel, ParcelFeature } from './types.js'
 */
