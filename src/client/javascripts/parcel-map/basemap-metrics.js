// TEMPORARY (TGC-1418 follow-up): OS Maps vs OpenStreetMap performance
// comparison. Delete this whole file, its one import, and the four call
// sites marked "metrics:" in index.js once the comparison is complete.

import { SOURCE_ID_PARCELS } from './config.js'

const EVENT_METRICS_UPDATE = 'parcel-map:basemap-metrics'

// URL fragments identifying a network request as part of the basemap load,
// so PerformanceObserver only counts what's relevant to the comparison —
// not unrelated page assets (fonts, GOV.UK styles, analytics, etc).
const BASEMAP_URL_PATTERNS = ['/api/map/os-tiles', '/api/map/os-basemap', 'basemaps.cartocdn.com']

/**
 * Times a basemap load (via MapLibre's `idle` event) and tracks tile
 * requests/errors, first-tile time, and bytes transferred, dispatching a
 * `parcel-map:basemap-metrics` event on `target` on each change.
 *
 * bytesTransferred reads 0 for cross-origin responses without
 * Timing-Allow-Origin (e.g. CartoCDN) — a disclosed limitation, not a bug.
 * @param {import('maplibre-gl').Map} ml
 * @param {string} basemapProvider
 * @param {EventTarget} target  element to dispatch EVENT_METRICS_UPDATE on
 */
export function trackBasemapMetrics(ml, basemapProvider, target) {
  const startedAt = performance.now()
  /** @type {{ provider: string, tileRequests: number, tileErrors: number, loadMs: number | null, firstTileMs: number | null, bytesTransferred: number }} */
  const metrics = {
    provider: basemapProvider,
    tileRequests: 0,
    tileErrors: 0,
    loadMs: null,
    firstTileMs: null,
    bytesTransferred: 0
  }

  const emit = () => {
    target.dispatchEvent(new CustomEvent(EVENT_METRICS_UPDATE, { bubbles: true, detail: { ...metrics } }))
  }

  // TEMPORARY (TGC-1418 follow-up): dedup by tile ID. `sourcedata` can fire
  // more than once for the same tile (re-renders, style changes), so without
  // this tileRequests over-counts — delete this Set + the `if` guard below
  // (keep the `metrics.tileRequests += 1` line) when the comparison ends.
  const seenTileIds = new Set()
  const onSourceData = (/** @type {{ tile?: { tileID?: { key?: string } }, sourceId?: string }} */ e) => {
    // The map also has a parcels source (vector tiles/geojson) — exclude it
    // so its tile events don't get counted as basemap activity.
    if (e.tile && e.sourceId !== SOURCE_ID_PARCELS) {
      const tileId = e.tile.tileID?.key
      if (tileId !== undefined) {
        if (seenTileIds.has(tileId)) {
          return
        }
        seenTileIds.add(tileId)
      }
      metrics.tileRequests += 1
      if (metrics.firstTileMs === null) {
        metrics.firstTileMs = Math.round(performance.now() - startedAt)
      }
      emit()
    }
  }
  const onError = () => {
    metrics.tileErrors += 1
    emit()
  }
  const onIdle = () => {
    if (metrics.loadMs === null) {
      metrics.loadMs = Math.round(performance.now() - startedAt)
      emit()
    }
  }

  ml.on('sourcedata', onSourceData)
  ml.on('error', onError)
  ml.on('idle', onIdle)

  /** @type {PerformanceObserver | undefined} */
  let perfObserver
  // Tracks entries already counted, since `buffered: true` replays every
  // resource-timing entry since navigation start on every observer — without
  // this, switching basemap providers mid-session would re-sum bytes from
  // the *previous* provider's tiles into the new provider's total.
  const seenEntries = new WeakSet()
  if (typeof PerformanceObserver !== 'undefined') {
    perfObserver = new PerformanceObserver((list) => {
      let added = false
      for (const entry of list.getEntries()) {
        if (entry.startTime < startedAt || seenEntries.has(entry)) {
          continue
        }
        if (BASEMAP_URL_PATTERNS.some((pattern) => entry.name.includes(pattern))) {
          seenEntries.add(entry)
          const resourceEntry = /** @type {PerformanceResourceTiming} */ (entry)
          metrics.bytesTransferred += resourceEntry.transferSize ?? 0
          added = true
        }
      }
      if (added) {
        emit()
      }
    })
    perfObserver.observe({ type: 'resource', buffered: true })
  }

  emit()

  return () => {
    ml.off('sourcedata', onSourceData)
    ml.off('error', onError)
    ml.off('idle', onIdle)
    perfObserver?.disconnect()
  }
}

export { EVENT_METRICS_UPDATE }
