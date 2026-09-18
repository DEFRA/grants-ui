import { fitToParcels } from './map-helpers.js'
import {
  MSG_SHOW_ALL_PARCELS,
  MSG_SHOW_ALL_PARCELS_AVAILABLE,
  SHOW_ALL_BUTTON_STYLES,
  SHOW_ALL_BUTTON_CLASS,
  SHOW_ALL_BUTTON_FOCUS_STYLE,
  SHOW_ALL_MOVE_THRESHOLD_PX,
  VISUALLY_HIDDEN_STYLES
} from './config.js'

/**
 * @import { Map as MLMap } from 'maplibre-gl'
 * @import { BBox } from './parcel-map-loader.js'
 */

const SHOW_ALL_ICON_SVG =
  '<svg class="map-reset-view-button__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M8 4H4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<path d="M16 4h4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<path d="M8 20H4v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<path d="M16 20h4v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<rect x="7" y="7" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"></rect>' +
  '</svg>'

const FOCUS_STYLE_MARKER = 'data-parcel-map-show-all-focus-style'

// Injected once document-wide, guarded against duplicates.
function ensureFocusStyleInjected() {
  if (document.head.querySelector(`style[${FOCUS_STYLE_MARKER}]`)) {
    return
  }
  const style = document.createElement('style')
  style.setAttribute(FOCUS_STYLE_MARKER, '')
  style.textContent = SHOW_ALL_BUTTON_FOCUS_STYLE
  document.head.appendChild(style)
}

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

const ZOOM_DRIFT_TOLERANCE = 0.1

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
 * Adds the "Show all parcels" button.
 * @param {MLMap} ml
 * @param {BBox | null} bbox
 * @param {HTMLDivElement | null} mapEl
 * @param {Array<() => void>} cleanups
 * @returns {HTMLButtonElement | undefined}
 */
export function attachResetButton(ml, bbox, mapEl, cleanups) {
  const wrapper = mapEl?.parentElement
  if (!wrapper || !bbox) {
    return undefined
  }

  ensureFocusStyleInjected()

  const button = /** @type {HTMLButtonElement} */ (document.createElement('button'))
  button.type = 'button'
  button.className = SHOW_ALL_BUTTON_CLASS
  button.style.cssText = SHOW_ALL_BUTTON_STYLES
  button.hidden = true
  button.innerHTML = `${SHOW_ALL_ICON_SVG}<span>${MSG_SHOW_ALL_PARCELS}</span>`
  wrapper.appendChild(button)

  const announcer = document.createElement('div')
  announcer.setAttribute('role', 'status')
  announcer.setAttribute('aria-live', 'polite')
  announcer.style.cssText = VISUALLY_HIDDEN_STYLES
  wrapper.appendChild(announcer)

  // Derived from bbox since fitBounds() may not have applied synchronously yet.
  const initialCenter = {
    lng: (bbox.minLng + bbox.maxLng) / 2,
    lat: (bbox.minLat + bbox.maxLat) / 2
  }
  let initialZoom = ml.getZoom()

  const showButton = () => {
    if (!button.hidden) {
      return
    }
    button.hidden = false
    button.style.display = 'flex'
    announcer.textContent = MSG_SHOW_ALL_PARCELS_AVAILABLE
  }
  const hideButton = () => {
    button.hidden = true
    button.style.display = 'none'
    announcer.textContent = ''
  }

  // First idle is when fitBounds's real zoom becomes known.
  const onIdle = () => {
    initialZoom = ml.getZoom()
  }
  // Also fires for the button's own reset fitBounds(), hence drift-checking
  // instead of reacting to the event directly.
  const onMoveEnd = () => {
    if (hasMovedFromInitialView(ml, initialCenter, initialZoom)) {
      showButton()
    } else {
      hideButton()
    }
  }
  const onClick = () => {
    fitToParcels(ml, bbox, { animate: true })
  }

  ml.once('idle', onIdle)
  ml.on('moveend', onMoveEnd)
  cleanups.push(() => ml.off('moveend', onMoveEnd))
  button.addEventListener('click', onClick)
  cleanups.push(() => button.removeEventListener('click', onClick))

  return button
}
