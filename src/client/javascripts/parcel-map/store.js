/**
 * @import { MetaIndex } from './helpers.js'
 * @import { BBox } from './bounds.js'
 */

/**
 * Everything the map knows about the user's parcels, from the parcels route,
 * shared by reference with every attached module.
 * @typedef {{ parcelIds: string[], metaIndex: MetaIndex, bbox: BBox | null }} ParcelStore
 */

/** @returns {ParcelStore} */
export function createParcelStore() {
  return { parcelIds: [], metaIndex: {}, bbox: null }
}
