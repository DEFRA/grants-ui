import { COMPOUND_ID_EXPR, hideTooltip } from './map-helpers.js'
import {
  LAYER_ID_FILL,
  FILL_OPACITY_DEFAULT,
  FILL_OPACITY_SELECTED,
  SELECTION_NONE_SENTINEL,
  EVENT_SELECTION
} from './config.js'

/**
 * @import { Map as MLMap } from 'maplibre-gl'
 */

/**
 * Bridges the interact plugin's selection state to the component's public API:
 * re-applies the fill-opacity highlight and re-dispatches selection changes as
 * `parcel-map:selection` events on `host`.
 * @param {{
 *   host: HTMLElement,
 *   mapInstance: { on: Function, off?: Function, emit: Function },
 *   ml: MLMap,
 *   tooltip: HTMLElement | undefined,
 *   cleanups: Array<() => void>,
 *   multiSelect: boolean
 * }} params
 */
export function attachSelectionRelay({ host, mapInstance, ml, tooltip, cleanups, multiSelect }) {
  /** @param {string[]} selectedIds */
  const applyHighlight = (selectedIds) => {
    const matchList = selectedIds.length > 0 ? selectedIds : [SELECTION_NONE_SENTINEL]
    ml.setPaintProperty(LAYER_ID_FILL, 'fill-opacity', [
      'match',
      COMPOUND_ID_EXPR,
      matchList,
      FILL_OPACITY_SELECTED,
      FILL_OPACITY_DEFAULT
    ])
  }

  /** @type {{ featureId: string | number, layerId?: unknown, idProperty?: unknown, properties?: Record<string, unknown>, geometry?: unknown } | null} */
  let lastSelectedFeature = null
  // Clearing the selection via the map's own "clear" action (e.g. the Change
  // link) must not be re-asserted — only a click-driven toggle-off should be.
  let suppressReassert = false

  const onSelectionChange = (
    /** @type {{ selectedFeatures: Array<{ featureId: string | number, layerId?: unknown, idProperty?: unknown, properties?: Record<string, unknown>, geometry?: unknown }> }} */ {
      selectedFeatures
    }
  ) => {
    // Re-clicking the only selected parcel toggles it off in the vendor plugin;
    // on a single-select page that reads as an accidental deselect, so put the
    // same feature straight back (properties/geometry included, or the
    // re-added feature loses its area/land-cover data) and treat this event as
    // a no-op.
    if (!multiSelect && selectedFeatures.length === 0 && lastSelectedFeature && !suppressReassert) {
      const { featureId, layerId, idProperty, properties, geometry } = lastSelectedFeature
      mapInstance.emit('interact:selectFeature', { featureId, layerId, idProperty, properties, geometry })
      return
    }

    const selectedIds = selectedFeatures.map((f) => String(f.featureId))
    const selectedParcels = selectedFeatures.map((f) => ({ id: String(f.featureId), ...f.properties }))
    applyHighlight(selectedIds)
    if (selectedIds.length === 0 && tooltip) {
      hideTooltip(tooltip)
    }
    lastSelectedFeature = selectedFeatures.length === 1 ? selectedFeatures[0] : null
    suppressReassert = false
    host.dispatchEvent(new CustomEvent(EVENT_SELECTION, { bubbles: true, detail: { selectedIds, selectedParcels } }))
  }

  mapInstance.on('interact:selectionchange', onSelectionChange)
  cleanups.push(() => mapInstance.off?.('interact:selectionchange', onSelectionChange))

  return {
    // Used by the host element's public clearSelection() so a deliberate clear
    // (not a re-click) is allowed to actually clear.
    allowNextClear: () => {
      suppressReassert = true
    }
  }
}
