/* eslint-disable no-console */
// @ts-ignore — no type declarations shipped with this package
import InteractiveMap from '@defra/interactive-map'
// @ts-ignore — no type declarations shipped with this package
import maplibreProvider from '@defra/interactive-map/providers/maplibre'
// @ts-ignore — no type declarations shipped with this package
import createInteractPlugin from '@defra/interactive-map/plugins/interact'
import { getMapStyle, withParcelHitTolerance } from './map-helpers.js'
import {
  MAP_LABEL,
  PARCEL_ID_PROPERTY,
  LAYER_ID_FILL,
  MAP_DEFAULT_HEIGHT,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_MIN_ZOOM,
  MAP_LOAD_TIMEOUT_MS
} from './config.js'

/**
 * @import { Map as MLMap } from 'maplibre-gl'
 */

/**
 * Builds the map DOM, boots InteractiveMap + the interact plugin, and resolves
 * the raw MapLibre instance once the style is ready — or null on load failure
 * or the load timeout.
 * @param {HTMLElement} host  the <parcel-map> element (DOM parent)
 * @param {{
 *   multiSelect: boolean,
 *   skeleton: HTMLElement | null,
 *   isLoading: () => boolean,
 *   cleanups: Array<() => void>
 * }} options
 * @returns {{
 *   mapEl: HTMLDivElement,
 *   mapInstance: InstanceType<typeof InteractiveMap>,
 *   interactPlugin: ReturnType<typeof createInteractPlugin>,
 *   ready: Promise<MLMap | null>
 * }}
 */
export function initMap(host, { multiSelect, skeleton, isLoading, cleanups }) {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:relative;width:100%;height:100%'

  const mapEl = /** @type {HTMLDivElement} */ (document.createElement('div'))
  mapEl.id = `parcel-map-${crypto.randomUUID()}`
  mapEl.style.cssText = 'width:100%;height:100%'
  wrapper.appendChild(mapEl)

  if (skeleton) {
    skeleton.before(wrapper)
  } else {
    host.appendChild(wrapper)
  }

  // Handles feature selection accessibly: pointer clicks, a touch crosshair +
  // Select button, and a keyboard-navigable feature listbox.
  const interactPlugin = createInteractPlugin({
    interactionModes: ['selectFeature'],
    multiSelect,
    deselectOnClickOutside: true,
    layers: [
      {
        layerId: LAYER_ID_FILL,
        idProperty: PARCEL_ID_PROPERTY,
        labelProperty: PARCEL_ID_PROPERTY
      }
    ]
  })

  const mapInstance = new InteractiveMap(mapEl.id, {
    behaviour: 'inline',
    mapLabel: MAP_LABEL,
    containerHeight: host.style.height || MAP_DEFAULT_HEIGHT,
    mapProvider: withParcelHitTolerance(maplibreProvider()),
    mapStyle: getMapStyle(),
    plugins: [interactPlugin],
    center: MAP_DEFAULT_CENTER,
    zoom: MAP_DEFAULT_ZOOM,
    minZoom: MAP_MIN_ZOOM,
    urlPosition: 'none'
  })

  const ready = /** @type {Promise<MLMap | null>} */ (
    new Promise((resolve) => {
      const timeout = globalThis.setTimeout(() => resolve(null), MAP_LOAD_TIMEOUT_MS)

      mapInstance.on('map:error', (/** @type {unknown} */ err) => {
        console.error('[parcel-map] map failed to load', err)
        globalThis.clearTimeout(timeout)
        resolve(null)
      })

      // map:ready gives us the raw MapLibre instance; map:stylechange is the
      // earliest point addSource/addLayer can safely be called.
      /** @type {MLMap | null} */
      let mlInstance = null
      mapInstance.on('map:ready', (/** @type {{ map: MLMap }} */ { map: m }) => {
        mlInstance = m
        const onError = (/** @type {unknown} */ err) => {
          console.error('[parcel-map] maplibre error', err)
          if (isLoading()) {
            globalThis.clearTimeout(timeout)
            resolve(null)
          }
        }
        m.on('error', onError)
        cleanups.push(() => m.off('error', onError))
      })
      mapInstance.on('map:stylechange', () => {
        if (mlInstance && isLoading()) {
          globalThis.clearTimeout(timeout)
          resolve(mlInstance)
        }
      })
    })
  )

  return { mapEl, mapInstance, interactPlugin, ready }
}
