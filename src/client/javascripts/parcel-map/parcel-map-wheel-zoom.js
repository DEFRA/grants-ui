/**
 * @param {HTMLElement} container
 * @param {boolean} touch
 */
function createWheelHint(container, touch) {
  const hint = document.createElement('div')
  hint.className = 'parcel-map-wheel-hint'
  const modifier = /Mac/i.test(navigator.platform || navigator.userAgent) ? '⌘ command' : 'Ctrl'
  hint.textContent = touch ? 'Use two fingers to move or zoom' : `Hold the ${modifier} key and scroll to zoom`
  container.appendChild(hint)
  return hint
}

/**
 * Require Ctrl/Cmd for mouse-wheel and two-finger touchpad scroll zoom,
 * leaving ordinary scrolling to the page. Keep MapLibre's native handling
 * of scroll and pinch zoom, including in-flight zoom animations.
 * @param {import('maplibre-gl').Map} ml
 * @param {Array<() => void>} cleanups
 * @param {HTMLElement} hintContainer Container holding the map and its hint row.
 * @param {boolean} [touch=false] Whether the primary input is touch.
 */
export function attachWheelZoom(ml, cleanups, hintContainer, touch = false) {
  const container = ml.getCanvasContainer()
  const hint = createWheelHint(hintContainer, touch)

  /** @param {WheelEvent} event */
  const onWheel = (event) => {
    // Read units first: some browsers adapt deltas when deltaMode is read.
    Reflect.get(event, 'deltaMode')
    // Browsers also synthesise Ctrl + wheel for pinch gestures.
    const zoom = (event.ctrlKey || event.metaKey) && event.deltaY !== 0
    if (!zoom) {
      // Stop MapLibre from cancelling ordinary page scrolling.
      event.stopPropagation()
    }
  }

  ml.scrollZoom.enable()
  container.addEventListener('wheel', onWheel, { capture: true, passive: false })

  cleanups.push(() => {
    container.removeEventListener('wheel', onWheel, true)
    ml.scrollZoom.disable()
    hint.remove()
  })
}
