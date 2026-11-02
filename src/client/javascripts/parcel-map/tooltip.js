import { resolveFeatureId, showTooltip, hideTooltip } from './helpers.js'
import { CLASS_TOOLTIP, LAYER_ID_FILL, LAYER_ID_LABEL_CLUSTER } from './config.js'

/**
 * @import { ParcelProperties } from './helpers.js'
 * @import { MapContext } from './element.js'
 */

/**
 * Adds the parcel tooltip and its MapLibre hover listeners, registering
 * each `off` into `cleanups` so teardown removes every one. Returns the tooltip
 * element (or undefined if the map wrapper isn't present).
 * @param {Pick<MapContext, 'ml' | 'store' | 'mapEl' | 'cleanups'>} context
 * @returns {HTMLElement | undefined}
 */
export function attachTooltip({ ml, store, mapEl, cleanups }) {
  const wrapper = mapEl?.parentElement
  if (!wrapper) {
    return undefined
  }
  const { metaIndex } = store

  const tooltip = document.createElement('div')
  tooltip.className = CLASS_TOOLTIP
  tooltip.setAttribute('role', 'tooltip')
  tooltip.setAttribute('aria-live', 'polite')
  tooltip.hidden = true
  wrapper.appendChild(tooltip)

  const onTooltipMove = (
    /** @type {import('maplibre-gl').MapMouseEvent & { features?: import('maplibre-gl').MapGeoJSONFeature[] }} */ e
  ) => {
    const feature = e.features?.[0]
    // A cluster badge sits on top of the fill layer, but this listener still
    // fires for the parcel underneath it — hide the tooltip rather than show
    // details for a parcel the badge is standing in for.
    if (!feature || ml.queryRenderedFeatures(e.point, { layers: [LAYER_ID_LABEL_CLUSTER] }).length > 0) {
      hideTooltip(tooltip)
      return
    }
    const id = resolveFeatureId(feature)
    const props = /** @type {ParcelProperties} */ ({ ...feature.properties, ...metaIndex[id] })
    const point = ml.project(e.lngLat)
    showTooltip(tooltip, id, props, point.x, point.y, mapEl)
  }
  const onMouseEnter = () => {
    ml.getCanvas().style.cursor = 'pointer'
  }
  const onMouseLeave = () => {
    ml.getCanvas().style.cursor = ''
    hideTooltip(tooltip)
  }

  ml.on('mousemove', LAYER_ID_FILL, onTooltipMove)
  ml.on('mouseenter', LAYER_ID_FILL, onMouseEnter)
  ml.on('mouseleave', LAYER_ID_FILL, onMouseLeave)

  cleanups.push(
    () => ml.off('mousemove', LAYER_ID_FILL, onTooltipMove),
    () => ml.off('mouseenter', LAYER_ID_FILL, onMouseEnter),
    () => ml.off('mouseleave', LAYER_ID_FILL, onMouseLeave)
  )

  return tooltip
}
