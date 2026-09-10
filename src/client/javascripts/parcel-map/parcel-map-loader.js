/* eslint-disable no-console */
import { PARCELS_API_URL, FETCH_MAX_ATTEMPTS, FETCH_RETRY_DELAY_MS } from './config.js'

/**
 * @import { MetaIndex } from './map-helpers.js'
 */

/**
 * @typedef {{ minLng: number, minLat: number, maxLng: number, maxLat: number }} BBox
 * @typedef {{ parcelIds: string[], metaIndex: MetaIndex, bbox: BBox | null }} ParcelData
 */

/**
 * Fetches the authenticated user's parcels, retrying once after a short delay.
 * Returns null when every attempt fails — the caller treats that as an
 * `unavailable` error. Contains no map knowledge, only fetch + retry.
 * @param {string[]} enabledLandActions
 * @returns {Promise<ParcelData | null>}
 */
export async function fetchParcelData(enabledLandActions = []) {
  const params = new URLSearchParams()
  enabledLandActions.forEach((action) => params.append('enabledLandActions', action))
  const query = params.toString()
  const url = query ? `${PARCELS_API_URL}?${query}` : PARCELS_API_URL

  /** @type {unknown} */
  let lastError
  for (let attempt = 0; attempt < FETCH_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, FETCH_RETRY_DELAY_MS))
    }
    try {
      const resp = await fetch(url)
      if (resp.ok) {
        return await parseParcelResponse(resp)
      }
      lastError = new Error(`HTTP ${resp.status}`)
    } catch (err) {
      lastError = err
    }
  }
  console.error('[parcel-map] parcels fetch failed', lastError)
  return null
}

/**
 * Coerces the parcels endpoint's response into ids + a metadata index in a
 * single pass.
 * @param {Response} resp
 * @returns {Promise<ParcelData>}
 */
export async function parseParcelResponse(resp) {
  /** @type {{ features: GeoJSON.Feature[], bbox: BBox | null }} */
  const body = await resp.json()
  const features = Array.isArray(body.features) ? body.features : []

  /** @type {string[]} */
  const parcelIds = []
  /** @type {MetaIndex} */
  const metaIndex = {}
  for (const f of features) {
    const rawId = f.id ?? f.properties?.id
    if (typeof rawId !== 'string' && typeof rawId !== 'number') {
      continue
    }
    const id = String(rawId)
    parcelIds.push(id)
    metaIndex[id] = { ...f.properties, id }
  }

  return {
    parcelIds,
    metaIndex,
    bbox: body.bbox ?? null
  }
}
