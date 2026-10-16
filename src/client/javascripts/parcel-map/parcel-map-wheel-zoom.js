const HINT_DURATION_MS = 3000
const SCROLL_GESTURE_GAP_MS = 400
// Best-effort device detection across platforms, not a guaranteed device flag.
const TOUCHPAD_MAX_INITIAL_DELTA_PX = 40
// Match MapLibre's conversion for browsers that report deltas in lines.
const SCROLL_LINE_HEIGHT_PX = 40
// MapLibre recognises this wheel-event step irrespective of the host OS.
const MAPLIBRE_WHEEL_STEP = 4.000244140625

// Shared by map instances for this page view, including a map that reconnects.
// A fresh document resets guidance; no browser/session storage is needed.
const pageGuidance = { usedModifier: false }

/** @param {HTMLElement} container */
function createWheelHint(container) {
  const hint = document.createElement('div')
  hint.className = 'parcel-map-wheel-hint'
  hint.hidden = true
  // The map provides accessible zoom controls and keyboard help.
  hint.setAttribute('aria-hidden', 'true')
  const modifier = /Mac/i.test(navigator.platform || navigator.userAgent) ? 'Cmd' : 'Ctrl'
  container.appendChild(hint)

  /** @type {ReturnType<typeof globalThis.setTimeout> | undefined} */
  let hintTimeout
  const hideHint = () => {
    globalThis.clearTimeout(hintTimeout)
    hint.hidden = true
  }
  const learnModifier = () => {
    pageGuidance.usedModifier = true
    hideHint()
  }
  const showHint = (touchpadGesture) => {
    if (pageGuidance.usedModifier) {
      return
    }
    globalThis.clearTimeout(hintTimeout)
    hint.textContent = touchpadGesture
      ? `Hold ${modifier} and scroll with two fingers to move the map`
      : `Hold ${modifier} and scroll to zoom the map`
    hint.hidden = false
    // Keep the instruction visible until three seconds after scrolling stops.
    hintTimeout = globalThis.setTimeout(hideHint, HINT_DURATION_MS)
  }

  const remove = () => {
    hideHint()
    hint.remove()
  }
  return { hide: hideHint, show: showHint, learnModifier, remove }
}

/** @param {WheelEvent} event */
function isTouchpadScroll(event, deltaMode, deltaX, deltaY) {
  const horizontalTouchpad = deltaX !== 0 && !event.shiftKey && (deltaMode === 0 || !Number.isInteger(event.deltaX))
  const fineVerticalScroll = deltaY !== 0 && Math.abs(deltaY) < TOUCHPAD_MAX_INITIAL_DELTA_PX
  return horizontalTouchpad || fineVerticalScroll
}

function createScrollGesture() {
  let ctrlHeld = false
  let touchpadGesture = false
  let lastScrollTime = -Infinity

  /** @param {KeyboardEvent} event */
  const onKeyChange = (event) => {
    ctrlHeld = event.ctrlKey
  }
  const reset = () => {
    ctrlHeld = false
    touchpadGesture = false
    lastScrollTime = -Infinity
  }
  // Browsers synthesise Ctrl + wheel for pinch, even on Mac. A physical
  // Ctrl keypress distinguishes Ctrl + two-finger scrolling from that pinch.
  /** @param {WheelEvent} event */
  const isPinch = (event) => event.ctrlKey && !ctrlHeld

  /** @param {WheelEvent} event */
  const classify = (event, deltaMode, deltaX, deltaY) => {
    if (isPinch(event)) {
      return touchpadGesture
    }
    const now = Date.now()
    if (now - lastScrollTime > SCROLL_GESTURE_GAP_MS) {
      touchpadGesture = false
    }
    lastScrollTime = now

    const mouseWheel = deltaMode === 2 || (deltaY !== 0 && deltaY % MAPLIBRE_WHEEL_STEP === 0)
    if (mouseWheel) {
      touchpadGesture = false
      return touchpadGesture
    }
    if (isTouchpadScroll(event, deltaMode, deltaX, deltaY)) {
      // Retain the classification when the same gesture speeds up or has
      // larger momentum deltas; do not switch from panning to zoom mid-gesture.
      touchpadGesture = true
    }
    return touchpadGesture
  }

  return { onKeyChange, reset, isPinch, classify }
}

/** @param {WheelEvent} event */
function shouldZoom(event, pinch, touchpadGesture) {
  return (event.ctrlKey || event.metaKey) && (pinch || !touchpadGesture) && event.deltaY !== 0
}

/**
 * @param {import('maplibre-gl').Map} ml
 * @param {ReturnType<typeof createScrollGesture>} gesture
 * @param {ReturnType<typeof createWheelHint>} hint
 */
function createWheelHandler(ml, gesture, hint) {
  /** @param {WheelEvent} event */
  return (event) => {
    // Read the units first: some browsers adapt the deltas when deltaMode is read.
    const deltaMode = event.deltaMode
    if (event.deltaX === 0 && event.deltaY === 0) {
      return
    }
    // Firefox and other browser/driver combinations may use lines instead of
    // pixels for wheel or touchpad input. Convert only our detection/pan offsets;
    // native wheel zoom still receives the original event and its deltaMode.
    const scale = deltaMode === 1 ? SCROLL_LINE_HEIGHT_PX : 1
    const deltaX = event.deltaX * scale
    const deltaY = event.deltaY * scale

    const pinch = gesture.isPinch(event)
    const touchpadGesture = gesture.classify(event, deltaMode, deltaX, deltaY)

    if (shouldZoom(event, pinch, touchpadGesture)) {
      ml.scrollZoom.enable()
      if (!pinch) {
        hint.learnModifier()
      } else {
        // Pinch zoom does not demonstrate knowledge of modifier scrolling.
        hint.hide()
      }
      return
    }

    ml.scrollZoom.disable()
    if ((event.ctrlKey || event.metaKey) && touchpadGesture) {
      event.preventDefault()
      ml.panBy([deltaX, deltaY], { duration: 0 })
      hint.learnModifier()
    } else {
      hint.show(touchpadGesture)
    }
  }
}

/**
 * Require Ctrl/Cmd for mouse-wheel zoom or two-finger touchpad panning,
 * leaving ordinary scrolling to the page. Browser wheel events have no device
 * flag, so touchpad detection uses pixel deltas and continuity within a gesture.
 * Keep MapLibre's native zoom handling, including trackpad pinch zoom.
 * @param {import('maplibre-gl').Map} ml
 * @param {Array<() => void>} cleanups
 */
export function attachWheelZoom(ml, cleanups) {
  const container = ml.getCanvasContainer()
  const hint = createWheelHint(container)
  const gesture = createScrollGesture()
  const onWheel = createWheelHandler(ml, gesture, hint)

  // Run before MapLibre's bubbling wheel listener. Only modifier panning or
  // native zoom cancels scrolling; ordinary events keep their default action.
  ml.scrollZoom.disable()
  container.addEventListener('wheel', onWheel, { capture: true, passive: false })
  container.addEventListener('mouseleave', hint.hide)
  window.addEventListener('keydown', gesture.onKeyChange, true)
  window.addEventListener('keyup', gesture.onKeyChange, true)
  window.addEventListener('blur', gesture.reset)

  cleanups.push(() => {
    container.removeEventListener('wheel', onWheel, true)
    container.removeEventListener('mouseleave', hint.hide)
    window.removeEventListener('keydown', gesture.onKeyChange, true)
    window.removeEventListener('keyup', gesture.onKeyChange, true)
    window.removeEventListener('blur', gesture.reset)
    ml.scrollZoom.disable()
    hint.remove()
  })
}
