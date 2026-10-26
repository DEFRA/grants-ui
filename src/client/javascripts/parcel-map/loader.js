import { PARCELS_API_URL, FETCH_MAX_ATTEMPTS, FETCH_RETRY_DELAY_MS } from './config.js'

/**
 * @import { MetaIndex } from './helpers.js'
 * @import { BBox } from './bounds.js'
 */

/**
 * @typedef {{ parcelIds: string[], metaIndex: MetaIndex, bbox: BBox | null }} ParcelData
 */

/**
 * Fetches the authenticated user's parcels, retrying once after a short delay.
 * Returns null when every attempt fails; the element reports that as the map
 * being unavailable. Contains no map knowledge, only fetch + retry.
 * @param {string[]} enabledLandActions
 * @returns {Promise<ParcelData | null>}
 */
export async function fetchParcelData(enabledLandActions = []) {
  const params = new URLSearchParams()
  enabledLandActions.forEach((action) => params.append('enabledLandActions', action))
  const query = params.toString()
  const url = query ? `${PARCELS_API_URL}?${query}` : PARCELS_API_URL
  return attemptFetch(url, FETCH_MAX_ATTEMPTS)
}

/**
 * One attempt, retrying after a short delay while attempts remain.
 * @param {string} url
 * @param {number} attemptsLeft
 * @returns {Promise<ParcelData | null>}
 */
async function attemptFetch(url, attemptsLeft) {
  try {
    const resp = await fetch(url)
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`)
    }
    return await parseParcelResponse(resp)
  } catch {
    if (attemptsLeft <= 1) {
      return null
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, FETCH_RETRY_DELAY_MS))
    return attemptFetch(url, attemptsLeft - 1)
  }
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
