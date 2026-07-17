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
 *   mapInstance: { on: Function, off?: Function },
 *   ml: MLMap,
 *   tooltip: HTMLElement | undefined,
 *   cleanups: Array<() => void>
 * }} params
 */
export function attachSelectionRelay({ host, mapInstance, ml, tooltip, cleanups }) {
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

  const onSelectionChange = (
    /** @type {{ selectedFeatures: Array<{ featureId: string | number }> }} */ { selectedFeatures }
  ) => {
    const selectedIds = selectedFeatures.map((f) => String(f.featureId))
    applyHighlight(selectedIds)
    if (selectedIds.length === 0 && tooltip) {
      hideTooltip(tooltip)
    }
    host.dispatchEvent(new CustomEvent(EVENT_SELECTION, { bubbles: true, detail: { selectedIds } }))
  }

  mapInstance.on('interact:selectionchange', onSelectionChange)
  cleanups.push(() => mapInstance.off?.('interact:selectionchange', onSelectionChange))
}
