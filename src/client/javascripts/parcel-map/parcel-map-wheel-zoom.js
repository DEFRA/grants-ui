const HINT_DURATION_MS = 3000
const SCROLL_GESTURE_GAP_MS = 400
// Best-effort device detection across platforms, not a guaranteed device flag.
const TOUCHPAD_MAX_INITIAL_DELTA_PX = 4
const SCROLL_CLASSIFICATION_DELAY_MS = 40
const TOUCHPAD_MAX_DELTA_TIME = 200
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
  /** @type {'wheel' | 'touchpad' | null} */
  let device = null
  let lastScrollTime = -Infinity

  /** @param {KeyboardEvent | MouseEvent} event */
  const onModifierChange = (event) => {
    ctrlHeld = event.ctrlKey
  }
  const reset = () => {
    ctrlHeld = false
    device = null
    lastScrollTime = -Infinity
  }
  // Browsers synthesise Ctrl + wheel for pinch, even on Mac. A physical
  // Ctrl keypress or pointer event distinguishes physical Ctrl from that pinch.
  // Without either after a focus change, preserve pinch zoom as a best effort.
  /** @param {WheelEvent} event */
  const isPinch = (event) => event.ctrlKey && !ctrlHeld

  /** @param {WheelEvent} event */
  const classify = (event, deltaMode, deltaX, deltaY) => {
    const now = Date.now()
    const timeDelta = now - lastScrollTime
    if (timeDelta > SCROLL_GESTURE_GAP_MS) {
      device = null
    }
    lastScrollTime = now

    const discreteLines = deltaMode === 1 && Number.isInteger(event.deltaX) && Number.isInteger(event.deltaY)
    const mouseWheel =
      deltaMode === 2 ||
      (discreteLines && device !== 'touchpad') ||
      (deltaY !== 0 && deltaY % MAPLIBRE_WHEEL_STEP === 0)
    if (mouseWheel) {
      device = 'wheel'
    } else if (isTouchpadScroll(event, deltaMode, deltaX, deltaY)) {
      // Retain the classification when the same gesture speeds up or has
      // larger momentum deltas; do not switch from panning to zoom mid-gesture.
      device = 'touchpad'
    } else if (device === null && timeDelta <= SCROLL_GESTURE_GAP_MS) {
      // Match MapLibre's timing heuristic for larger, otherwise ambiguous deltas.
      device = Math.abs(timeDelta * deltaY) < TOUCHPAD_MAX_DELTA_TIME ? 'touchpad' : 'wheel'
    }
    return device
  }

  const resolveWheel = () => (device = 'wheel')
  return { onModifierChange, reset, isPinch, classify, resolveWheel }
}

/**
 * @param {import('maplibre-gl').Map} ml
 * @param {ReturnType<typeof createScrollGesture>} gesture
 * @param {ReturnType<typeof createWheelHint>} hint
 */
function createWheelHandler(ml, gesture, hint) {
  const forwardedEvents = new WeakSet()
  /** @type {Array<{ event: WheelEvent, offset: [number, number] }>} */
  let pendingEvents = []
  /** @type {ReturnType<typeof globalThis.setTimeout> | undefined} */
  let pendingTimeout
  const reset = () => {
    globalThis.clearTimeout(pendingTimeout)
    pendingEvents = []
  }
  const flush = (device) => {
    const events = pendingEvents
    reset()
    for (const { event, offset } of events) {
      if (device === 'touchpad') {
        ml.panBy(offset, { duration: 0 })
      } else {
        // Replay only events whose original dispatch has finished. Keeping the
        // original event preserves its units and pointer position for native zoom.
        forwardedEvents.add(event)
        event.target?.dispatchEvent(event)
        forwardedEvents.delete(event)
      }
      hint.learnModifier()
    }
  }

  /** @param {WheelEvent} event */
  const onWheel = (event) => {
    if (forwardedEvents.has(event)) {
      return
    }
    // Read the units first: some browsers adapt the deltas when deltaMode is read.
    const deltaMode = event.deltaMode
    if (event.deltaX === 0 && event.deltaY === 0) {
      event.stopPropagation()
      return
    }
    // Firefox and other browser/driver combinations may use lines instead of
    // pixels for wheel or touchpad input. Convert only our detection/pan offsets;
    // native wheel zoom still receives the original event and its deltaMode.
    const scale = deltaMode === 1 ? SCROLL_LINE_HEIGHT_PX : 1
    const deltaX = event.deltaX * scale
    const deltaY = event.deltaY * scale

    const pinch = gesture.isPinch(event)
    if (pinch) {
      flush(gesture.resolveWheel())
      // Pinch zoom does not demonstrate knowledge of modifier scrolling.
      hint.hide()
      return
    }

    const device = gesture.classify(event, deltaMode, deltaX, deltaY)
    const modifier = event.ctrlKey || event.metaKey
    // Hold ambiguous modifier input briefly to avoid zooming before we know
    // whether to pan. Ordinary page scrolling is never delayed or cancelled.
    if (device === null && modifier && deltaY !== 0) {
      event.stopPropagation()
      event.preventDefault()
      pendingEvents.push({ event, offset: [deltaX, deltaY] })
      pendingTimeout = globalThis.setTimeout(() => flush(gesture.resolveWheel()), SCROLL_CLASSIFICATION_DELAY_MS)
      return
    }
    if (device !== null) {
      flush(device)
    }
    if (modifier && device === 'wheel' && deltaY !== 0) {
      hint.learnModifier()
      return
    }

    event.stopPropagation()
    if (modifier && device === 'touchpad') {
      event.preventDefault()
      ml.panBy([deltaX, deltaY], { duration: 0 })
      hint.learnModifier()
    } else {
      hint.show(device === 'touchpad')
    }
  }
  return { onWheel, reset }
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
  const wheelHandler = createWheelHandler(ml, gesture, hint)
  const onBlur = () => {
    gesture.reset()
    wheelHandler.reset()
  }

  // Run before MapLibre's bubbling wheel listener. Only modifier panning or
  // native zoom cancels scrolling; ordinary events keep their default action.
  // Keep it enabled so in-flight native zoom animations can finish.
  ml.scrollZoom.enable()
  container.addEventListener('wheel', wheelHandler.onWheel, { capture: true, passive: false })
  container.addEventListener('mouseleave', hint.hide)
  window.addEventListener('keydown', gesture.onModifierChange, true)
  window.addEventListener('keyup', gesture.onModifierChange, true)
  window.addEventListener('pointermove', gesture.onModifierChange, true)
  window.addEventListener('pointerdown', gesture.onModifierChange, true)
  window.addEventListener('blur', onBlur)

  cleanups.push(() => {
    container.removeEventListener('wheel', wheelHandler.onWheel, true)
    container.removeEventListener('mouseleave', hint.hide)
    window.removeEventListener('keydown', gesture.onModifierChange, true)
    window.removeEventListener('keyup', gesture.onModifierChange, true)
    window.removeEventListener('pointermove', gesture.onModifierChange, true)
    window.removeEventListener('pointerdown', gesture.onModifierChange, true)
    window.removeEventListener('blur', onBlur)
    wheelHandler.reset()
    ml.scrollZoom.disable()
    hint.remove()
  })
}
