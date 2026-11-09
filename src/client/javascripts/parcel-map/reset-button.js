import { fitToParcels } from './helpers.js'
import { createAnnouncer } from './announcer.js'
import { boundsCentre } from './bounds.js'
import {
  MSG_SHOW_ALL_PARCELS,
  MSG_SHOW_ALL_PARCELS_AVAILABLE,
  SHOW_ALL_BUTTON_ID,
  SHOW_ALL_ICON_SVG,
  SHOW_ALL_MOVE_THRESHOLD_PX,
  ZOOM_DRIFT_TOLERANCE
} from './config.js'

/**
 * Screen-pixel distance from the map's current center to initialCenter.
 * @param {MLMap} ml
 * @param {{ lng: number, lat: number }} initialCenter
 * @returns {number}
 */
function centerDriftPx(ml, initialCenter) {
  const initialPoint = ml.project(initialCenter)
  const currentPoint = ml.project(ml.getCenter())
  return Math.hypot(currentPoint.x - initialPoint.x, currentPoint.y - initialPoint.y)
}

/**
 * True once the map has moved far enough from the initial fit-to-parcels view.
 * @param {MLMap} ml
 * @param {{ lng: number, lat: number }} initialCenter
 * @param {number} initialZoom
 * @returns {boolean}
 */
function hasMovedFromInitialView(ml, initialCenter, initialZoom) {
  const zoomDrifted = Math.abs(ml.getZoom() - initialZoom) > ZOOM_DRIFT_TOLERANCE
  return zoomDrifted || centerDriftPx(ml, initialCenter) >= SHOW_ALL_MOVE_THRESHOLD_PX
}

/**
 * Adds the "View all land parcels" button.
 * @param {Pick<MapContext, 'mapInstance' | 'ml' | 'store' | 'mapEl' | 'cleanups'>} context
 */
export function attachResetButton({ mapInstance, ml, store, mapEl, cleanups }) {
  const wrapper = mapEl?.parentElement
  const { bbox } = store
  if (!wrapper || !bbox) {
    return undefined
  }

  let hidden = true

  const announcer = createAnnouncer(wrapper)

  // Placeholder until onIdle refines it to the real fitted center.
  const [centreLng, centreLat] = boundsCentre(bbox)
  let initialCenter = { lng: centreLng, lat: centreLat }
  let initialZoom = ml.getZoom()

  const showButton = () => {
    if (!hidden) {
      return
    }
    hidden = false
    mapInstance.toggleButtonState(SHOW_ALL_BUTTON_ID, 'hidden', false)
    announcer.announce(MSG_SHOW_ALL_PARCELS_AVAILABLE)
  }
  const hideButton = () => {
    hidden = true
    mapInstance.toggleButtonState(SHOW_ALL_BUTTON_ID, 'hidden', true)
    announcer.clear()
  }

  // Real center/zoom are only known once fitBounds settles. Listens once.
  const onIdle = () => {
    ml.off('idle', onIdle)
    initialCenter = ml.getCenter()
    initialZoom = ml.getZoom()
  }
  // Skips the reset's own moveend — its easing can briefly overshoot.
  let isResetting = false
  // Only shows the button; hiding it is click-only.
  const onMoveEnd = () => {
    if (isResetting) {
      isResetting = false
      return
    }
    if (hasMovedFromInitialView(ml, initialCenter, initialZoom)) {
      showButton()
    }
  }
  const onClick = () => {
    hideButton()
    isResetting = true
    fitToParcels(ml, bbox, { animate: true })
  }

  ml.on('idle', onIdle)
  cleanups.push(() => ml.off('idle', onIdle))
  ml.on('moveend', onMoveEnd)
  cleanups.push(() => ml.off('moveend', onMoveEnd))
  mapInstance.addButton(SHOW_ALL_BUTTON_ID, {
    label: MSG_SHOW_ALL_PARCELS,
    iconSvgContent: SHOW_ALL_ICON_SVG,
    isHidden: true,
    onClick,
    mobile: { slot: 'bottom-left' },
    tablet: { slot: 'bottom-left' },
    desktop: { slot: 'bottom-left' }
  })
}

/**
 * @import { Map as MLMap } from 'maplibre-gl'
 * @import { MapContext } from './element.js'
 */
