/**
 * @import { HydratedParcel } from '~/src/server/land-grants/types/land-grants.client.d.js'
 */

/**
 * A parcel as the map API serves it to the browser.
 *
 * Geometry is only present in mock mode — in real mode the client streams it
 * from the parcel-tiles route instead, so the feature carries properties only.
 * `sheet_id`/`parcel_id` are snake_case because they mirror the property names
 * in the land-grants vector tiles; `id` is the compound "SHEET-PARCEL" key the
 * interact plugin identifies and labels features by.
 * @typedef {object} ParcelFeature
 * @property {'Feature'} type
 * @property {string} id - compound "SHEET-PARCEL" identifier
 * @property {import('geojson').Geometry} [geometry] - mock mode only
 * @property {ParcelFeatureProperties} properties
 */

/**
 * @typedef {object} ParcelFeatureProperties
 * @property {string} id - compound "SHEET-PARCEL" identifier, same as ParcelFeature.id
 * @property {string} sheet_id
 * @property {string} parcel_id
 * @property {number | null} areaHa
 */

export {}

/**
 * Re-exported so map modules can name the shape without reaching into the
 * land-grants types directly.
 * @typedef {HydratedParcel} HydratedParcel
 */
