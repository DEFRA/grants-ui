import { fitToParcels } from './map-helpers.js'
import {
  MSG_SHOW_ALL_PARCELS,
  MSG_SHOW_ALL_PARCELS_AVAILABLE,
  SHOW_ALL_BUTTON_STYLES,
  SHOW_ALL_BUTTON_CLASS,
  SHOW_ALL_BUTTON_FOCUS_STYLE,
  SHOW_ALL_ICON_SVG,
  SHOW_ALL_MOVE_THRESHOLD_PX,
  ZOOM_DRIFT_TOLERANCE,
  PSEUDO_FULLSCREEN_CLASS,
  EVENT_PSEUDO_FULLSCREEN_CHANGE
} from './config.js'

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

// Registered as a library control so it renders inside @defra/interactive-map's
// fullscreen root; visibility tracks document.fullscreenElement directly since
// the control's own `inline: false` option is a no-op under behaviour: 'inline'.
const FULLSCREEN_CONTROL_ID = 'parcel-map-show-all-fullscreen'
const FULLSCREEN_CONTROL_SELECTOR = `[data-control-id="${FULLSCREEN_CONTROL_ID}"]`

/**
 * Same markup as attachResetButton's own button, built the same way, so the
 * two can never drift apart. React mounts this as static HTML (the library's
 * control API takes a markup string, not a component), so it starts hidden
 * and gets pointer-events:auto to opt back into the overlay ancestor that
 * disables clicks by default.
 * @returns {string}
 */
function buildFullscreenControlHtml() {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = SHOW_ALL_BUTTON_CLASS
  button.style.cssText = `${SHOW_ALL_BUTTON_STYLES};display:none;pointer-events:auto`
  button.dataset.controlId = FULLSCREEN_CONTROL_ID
  button.innerHTML = `${SHOW_ALL_ICON_SVG}<span>${MSG_SHOW_ALL_PARCELS}</span>`
  return button.outerHTML
}

/**
 * Registers a "Show all parcels" control visible only during native
 * fullscreen, since attachResetButton's own button isn't.
 * @param {InstanceType<typeof import('@defra/interactive-map').default>} mapInstance
 * @param {MLMap} ml
 * @param {BBox} bbox
 * @param {Array<() => void>} cleanups
 */
function attachFullscreenResetControl(mapInstance, ml, bbox, cleanups) {
  mapInstance.addControl(FULLSCREEN_CONTROL_ID, {
    label: MSG_SHOW_ALL_PARCELS,
    html: buildFullscreenControlHtml(),
    mobile: { slot: 'top-left' },
    tablet: { slot: 'top-left' },
    desktop: { slot: 'top-left' }
  })

  // The control's element doesn't exist until React mounts it, so both
  // listeners delegate from document instead of targeting it directly.
  const onDocumentClick = (/** @type {MouseEvent} */ e) => {
    if (/** @type {HTMLElement} */ (e.target).closest(FULLSCREEN_CONTROL_SELECTOR)) {
      fitToParcels(ml, bbox, { animate: true })
    }
  }
  const onFullscreenChange = () => {
    const control = /** @type {HTMLElement | null} */ (document.querySelector(FULLSCREEN_CONTROL_SELECTOR))
    if (!control) {
      return
    }
    const isFullscreen = Boolean(document.fullscreenElement) || Boolean(document.querySelector(`.${PSEUDO_FULLSCREEN_CLASS}`))
    control.style.display = isFullscreen ? 'inline-flex' : 'none'
  }

  document.addEventListener('click', onDocumentClick)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener(EVENT_PSEUDO_FULLSCREEN_CHANGE, onFullscreenChange)
  cleanups.push(() => document.removeEventListener('click', onDocumentClick))
  cleanups.push(() => document.removeEventListener('fullscreenchange', onFullscreenChange))
  cleanups.push(() => document.removeEventListener(EVENT_PSEUDO_FULLSCREEN_CHANGE, onFullscreenChange))
}

/**
 * Adds the "Show all parcels" button.
 * @param {InstanceType<typeof import('@defra/interactive-map').default>} mapInstance
 * @param {MLMap} ml
 * @param {BBox | null} bbox
 * @param {HTMLDivElement | null} mapEl
 * @param {Array<() => void>} cleanups
 * @returns {HTMLButtonElement | undefined}
 */
export function attachResetButton(mapInstance, ml, bbox, mapEl, cleanups) {
  const wrapper = mapEl?.parentElement
  if (!wrapper || !bbox) {
    return undefined
  }

  attachFullscreenResetControl(mapInstance, ml, bbox, cleanups)

  ensureFocusStyleInjected()

  const button = /** @type {HTMLButtonElement} */ (document.createElement('button'))
  button.type = 'button'
  button.className = SHOW_ALL_BUTTON_CLASS
  button.style.cssText = SHOW_ALL_BUTTON_STYLES
  button.hidden = true
  button.innerHTML = `${SHOW_ALL_ICON_SVG}<span>${MSG_SHOW_ALL_PARCELS}</span>`
  wrapper.appendChild(button)

  const announcer = document.createElement('div')
  announcer.className = 'govuk-visually-hidden'
  announcer.setAttribute('role', 'status')
  announcer.setAttribute('aria-live', 'polite')
  wrapper.appendChild(announcer)

  // Placeholder until onIdle refines it to the real fitted center.
  let initialCenter = {
    lng: (bbox.minLng + bbox.maxLng) / 2,
    lat: (bbox.minLat + bbox.maxLat) / 2
  }
  let initialZoom = ml.getZoom()

  const showButton = () => {
    if (!button.hidden) {
      return
    }
    button.hidden = false
    button.style.display = 'inline-flex'
    announcer.textContent = MSG_SHOW_ALL_PARCELS_AVAILABLE
  }
  const hideButton = () => {
    button.hidden = true
    button.style.display = 'none'
    announcer.textContent = ''
  }

  // Real center/zoom are only known once fitBounds settles.
  const onIdle = () => {
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

  ml.once('idle', onIdle)
  ml.on('moveend', onMoveEnd)
  cleanups.push(() => ml.off('moveend', onMoveEnd))
  button.addEventListener('click', onClick)
  cleanups.push(() => button.removeEventListener('click', onClick))

  return button
}

/**
 * @import { Map as MLMap } from 'maplibre-gl'
 * @import { BBox } from './parcel-map-loader.js'
 */
