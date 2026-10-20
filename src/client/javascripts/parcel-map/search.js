// @ts-ignore — no type declarations shipped with this package
import createSearchPlugin from '@defra/interactive-map/plugins/search'
import { compactParcelReference, formatParcelReference } from '../../../shared/format-parcel.js'
import { boundsToLngLatPairs } from './bounds.js'
import { fitToParcels, htmlEncode } from './helpers.js'
import { createAnnouncer } from './announcer.js'
import {
  CLASS_SEARCH_STATUS,
  FIT_BOUNDS_PADDING,
  MSG_SEARCH_ERROR,
  MSG_SEARCH_NO_RESULTS,
  PARCEL_BBOX_URL,
  PARCEL_SEARCH_URL,
  SEARCH_FIT_MAX_ZOOM,
  SEARCH_MATCH_EVENT,
  SEARCH_PLACEHOLDER,
  SEARCH_SUGGESTIONS_SELECTOR,
  SELECTION_SOURCE_SEARCH
} from './config.js'

/**
 * @import { Map as MLMap } from 'maplibre-gl'
 * @import { BBox } from './bounds.js'
 * @import { MapContext } from './element.js'
 */

const DATASET_NAME = 'parcels'

/** @param {string} value */
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Wraps the matched characters in <mark>, tolerating the space in the display
 * form. The rest is escaped: the plugin renders `marked` as HTML.
 * @param {string} display
 * @param {string} query
 * @returns {string}
 */
export function markMatch(display, query) {
  const compact = compactParcelReference(query)
  const match = compact ? new RegExp([...compact].map(escapeRegExp).join('[\\s-]*'), 'i').exec(display) : null
  if (!match) {
    return htmlEncode(display)
  }
  const end = match.index + match[0].length
  return `${htmlEncode(display.slice(0, match.index))}<mark>${htmlEncode(match[0])}</mark>${htmlEncode(display.slice(end))}`
}

/**
 * The search plugin's dataset. `bounds` is null so the plugin's own fit is a
 * no-op; attachParcelSearch frames the pick once its extent is looked up.
 */
export function createParcelSearchDataset() {
  return {
    name: DATASET_NAME,
    urlTemplate: `${PARCEL_SEARCH_URL}?q={query}`,
    // The plugin sanitises the input before querying; without a letter or digit
    // it would send an empty query, so skip the dataset and let it show "no matches".
    includeRegex: /[a-z0-9]/i,
    /**
     * @param {{ parcelIds?: unknown }} json
     * @param {string} query
     */
    parseResults(json, query) {
      const ids = Array.isArray(json?.parcelIds) ? json.parcelIds.filter((id) => typeof id === 'string') : []
      return ids.map((id) => {
        const display = formatParcelReference(id)
        return { id, type: DATASET_NAME, text: display, marked: markMatch(display, query), bounds: null, point: null }
      })
    }
  }
}

/**
 * The search plugin, configured to search the user's parcels by reference.
 */
export function createParcelSearchPlugin() {
  return createSearchPlugin({
    customDatasets: [createParcelSearchDataset()],
    showMarker: false,
    placeholder: SEARCH_PLACEHOLDER,
    noResultsMessage: MSG_SEARCH_NO_RESULTS,
    searchErrorMessage: MSG_SEARCH_ERROR
  })
}

/**
 * Animates the map to `bbox`. Closing the search box re-applies the map padding
 * with a jump that cancels any camera animation in flight, so the fit is
 * reissued once if that cut it short.
 * @param {MLMap} ml
 * @param {BBox} bbox
 * @returns {() => void} stops watching for the cut-short fit
 */
export function animateToBounds(ml, bbox) {
  const options = { animate: true, maxZoom: SEARCH_FIT_MAX_ZOOM }
  let retried = false
  const atTarget = () => {
    const target = ml.cameraForBounds(boundsToLngLatPairs(bbox), {
      padding: FIT_BOUNDS_PADDING,
      maxZoom: SEARCH_FIT_MAX_ZOOM
    })
    if (!target) {
      return true
    }
    const { x, y } = ml.project(ml.getCenter())
    const expected = ml.project(/** @type {[number, number]} */ (target.center))
    const zoomReached = target.zoom === undefined || Math.abs(ml.getZoom() - target.zoom) < 0.01
    return zoomReached && Math.hypot(x - expected.x, y - expected.y) < 1
  }
  const onMoveEnd = () => {
    if (retried || atTarget()) {
      ml.off('moveend', onMoveEnd)
      return
    }
    retried = true
    fitToParcels(ml, bbox, options)
  }
  ml.on('moveend', onMoveEnd)
  fitToParcels(ml, bbox, options)
  return () => ml.off('moveend', onMoveEnd)
}

/**
 * @param {string} id
 * @returns {Promise<BBox | null>}
 */
async function fetchParcelBbox(id) {
  try {
    const response = await fetch(PARCEL_BBOX_URL.replace('{parcelId}', encodeURIComponent(id)))
    if (!response.ok) {
      return null
    }
    const { bbox } = await response.json()
    return bbox ?? null
  } catch {
    return null
  }
}

/**
 * Looks up the picked parcel's extent, then selects it and animates the map to
 * it. A failed lookup selects nothing and reports search as unavailable.
 * @param {Pick<MapContext, 'host' | 'mapInstance' | 'ml' | 'mapEl' | 'store' | 'cleanups'>} context
 */
export function attachParcelSearch({ host, mapInstance, ml, mapEl, store, cleanups }) {
  const wrapper = mapEl?.parentElement
  const status = wrapper ? createAnnouncer(wrapper, { className: CLASS_SEARCH_STATUS }) : null
  let active = true
  /** @type {() => void} */
  let stopFit = () => {}
  /** @type {Map<string, BBox>} extents the bbox route has confirmed */
  const located = new Map()

  // A mousedown on a suggestion must not move focus: the item is not focusable,
  // so focus would land on this host (tabindex="-1"), which the plugin treats
  // as a click outside and closes the list before the click lands.
  const keepInputFocus = (/** @type {Event} */ event) => {
    if (/** @type {Element} */ (event.target).closest?.(SEARCH_SUGGESTIONS_SELECTOR)) {
      event.preventDefault()
    }
  }
  host.addEventListener('mousedown', keepInputFocus, true)

  // The plugin focuses the viewport before emitting the match, which can scroll
  // the page. Scroll events arrive a frame later, so `scroll` is still pre-focus.
  let scroll = { x: globalThis.scrollX, y: globalThis.scrollY }
  const trackScroll = () => {
    scroll = { x: globalThis.scrollX, y: globalThis.scrollY }
  }
  globalThis.addEventListener('scroll', trackScroll, { passive: true })

  const onMatch = async (/** @type {{ id: string }} */ { id }) => {
    if (globalThis.scrollX !== scroll.x || globalThis.scrollY !== scroll.y) {
      globalThis.scrollTo(scroll.x, scroll.y)
    }
    status?.clear()
    const bbox = located.get(id) ?? (await fetchParcelBbox(id))
    if (!active) {
      return
    }
    if (!bbox) {
      status?.announce(MSG_SEARCH_ERROR)
      return
    }
    located.set(id, bbox)
    host.selectParcels([id], { source: SELECTION_SOURCE_SEARCH })
    stopFit()
    stopFit = animateToBounds(ml, bbox)
  }

  mapInstance.on(SEARCH_MATCH_EVENT, onMatch)
  cleanups.push(() => {
    active = false
    stopFit()
    mapInstance.off?.(SEARCH_MATCH_EVENT, onMatch)
    host.removeEventListener('mousedown', keepInputFocus, true)
    globalThis.removeEventListener('scroll', trackScroll)
  })
}
