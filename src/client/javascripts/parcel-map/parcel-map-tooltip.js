import { resolveFeatureId, showTooltip, hideTooltip } from './map-helpers.js'
import { LAYER_ID_FILL, TOOLTIP_STYLES } from './config.js'

/**
 * @import { Map as MLMap } from 'maplibre-gl'
 * @import { ParcelProperties, MetaIndex } from './map-helpers.js'
 */

/**
 * Adds the parcel tooltip and its MapLibre click/hover listeners, registering
 * each `off` into `cleanups` so teardown removes every one. Returns the tooltip
 * element (or undefined if the map wrapper isn't present).
 * @param {MLMap} ml
 * @param {MetaIndex} metaIndex
 * @param {HTMLDivElement | null} mapEl
 * @param {Array<() => void>} cleanups
 * @returns {HTMLElement | undefined}
 */
export function attachTooltip(ml, metaIndex, mapEl, cleanups) {
  const wrapper = mapEl?.parentElement
  if (!wrapper) {
    return undefined
  }

  const tooltip = document.createElement('div')
  tooltip.setAttribute('role', 'tooltip')
  tooltip.setAttribute('aria-live', 'polite')
  tooltip.style.cssText = TOOLTIP_STYLES
  wrapper.appendChild(tooltip)

  const onTooltipClick = (
    /** @type {import('maplibre-gl').MapMouseEvent & { features?: import('maplibre-gl').MapGeoJSONFeature[] }} */ e
  ) => {
    const feature = e.features?.[0]
    if (!feature) {
      return
    }
    const id = resolveFeatureId(feature)
    const props = /** @type {ParcelProperties} */ ({ ...feature.properties, ...metaIndex[id] })
    const point = ml.project(e.lngLat)
    showTooltip(tooltip, id, props, point.x, point.y, mapEl)
  }
  const onMapClick = (/** @type {import('maplibre-gl').MapMouseEvent} */ e) => {
    if (ml.getLayer(LAYER_ID_FILL) && ml.queryRenderedFeatures(e.point, { layers: [LAYER_ID_FILL] }).length === 0) {
      hideTooltip(tooltip)
    }
  }
  const onMouseEnter = () => {
    ml.getCanvas().style.cursor = 'pointer'
  }
  const onMouseLeave = () => {
    ml.getCanvas().style.cursor = ''
  }

  ml.on('click', LAYER_ID_FILL, onTooltipClick)
  ml.on('click', onMapClick)
  ml.on('mouseenter', LAYER_ID_FILL, onMouseEnter)
  ml.on('mouseleave', LAYER_ID_FILL, onMouseLeave)

  cleanups.push(
    () => ml.off('click', LAYER_ID_FILL, onTooltipClick),
    () => ml.off('click', onMapClick),
    () => ml.off('mouseenter', LAYER_ID_FILL, onMouseEnter),
    () => ml.off('mouseleave', LAYER_ID_FILL, onMouseLeave)
  )

  return tooltip
}
