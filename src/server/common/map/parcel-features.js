import { stringifyParcel } from '~/src/shared/format-parcel.js'

/**
 * Normalises hydrated parcels into the flat shape the map response is built
 * from: the compound "SHEET-PARCEL" id, its two components, and area in
 * hectares (null when the size API supplied none).
 * @param {HydratedParcel[]} parcels
 * @returns {{ id: string, sheetId: string, parcelId: string, areaHa: number | null }[]}
 */
export function toParcelData(parcels) {
  return parcels.map((p) => ({
    id: stringifyParcel(p),
    sheetId: p.sheetId,
    parcelId: p.parcelId,
    areaHa: p.area?.value == null ? null : Number(p.area.value)
  }))
}

/**
 * Real-mode GeoJSON features: properties only, no geometry — the client streams
 * geometry from the parcel-tiles route. `sheet_id`/`parcel_id` are snake_case to
 * mirror the land-grants tile property names.
 * @param {{ id: string, sheetId: string, parcelId: string, areaHa: number | null }[]} parcelData
 * @returns {ParcelFeature[]}
 */
export function toGeoJsonFeatures(parcelData) {
  return parcelData.map((p) => ({
    type: 'Feature',
    id: p.id,
    properties: { id: p.id, sheet_id: p.sheetId, parcel_id: p.parcelId, areaHa: p.areaHa }
  }))
}

/**
 * @import { HydratedParcel, ParcelFeature } from './types.js'
 */
