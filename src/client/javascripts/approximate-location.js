import { map } from '@defra/forms-engine-plugin/shared.js'
import { isValidEastingNorthing } from './map-coordinate-utils.js'
import { DEFAULT_LOCATION_HINT_PREFIX } from '../../shared/map-location-hints.js'

const DEBOUNCE_MS = 300
const LOOKUP_TIMEOUT_MS = 3000

/**
 * Add a live location label below a map and return its selected-point updater.
 * @param {HTMLDivElement} container
 * @param {string} [prefix]
 * @param {(text: string) => void} [onChange]
 * @returns {(point?: { lat: number, long: number }) => void}
 */
export function createApproximateLocation(container, prefix = DEFAULT_LOCATION_HINT_PREFIX, onChange = () => {}) {
  const prefixText = prefix.trim() || DEFAULT_LOCATION_HINT_PREFIX
  const label = document.createElement('p')
  label.className = 'govuk-body govuk-!-margin-top-1 app-approximate-location'
  label.setAttribute('aria-live', 'polite')
  label.setAttribute('aria-atomic', 'true')
  container.after(label)

  /** @type {AbortController | null} */
  let controller = null
  /** @type {number | undefined} */
  let debounce
  /** @type {number | undefined} */
  let timeout

  const cancel = () => {
    window.clearTimeout(debounce)
    window.clearTimeout(timeout)
    controller?.abort()
    controller = null
  }
  window.addEventListener('pagehide', cancel)

  return (point) => {
    cancel()
    label.textContent = ''
    onChange('')
    if (!point) {
      return
    }
    let grid
    try {
      grid = map.latLongToEastingNorthing(point)
    } catch {
      // Some points within the location input bounds cannot be converted to the British National Grid.
      return
    }
    if (!isValidEastingNorthing(grid)) {
      return
    }
    const easting = Math.round(grid.easting)
    const northing = Math.round(grid.northing)

    debounce = window.setTimeout(async () => {
      const current = new window.AbortController()
      controller = current
      timeout = window.setTimeout(() => current.abort(), LOOKUP_TIMEOUT_MS)
      try {
        const response = await fetch(`/api/map/approximate-location?easting=${easting}&northing=${northing}`, {
          signal: current.signal
        })
        if (!response.ok) {
          return
        }
        const data = await response.json()
        if (!current.signal.aborted && controller === current && typeof data.label === 'string' && data.label.trim()) {
          const strong = document.createElement('strong')
          strong.textContent = prefixText
          label.replaceChildren(strong, ` ${data.label}`)
          onChange(label.textContent)
        }
      } catch {
        // The optional label must not interrupt the map. The endpoint logs lookup failures.
      } finally {
        if (controller === current) {
          window.clearTimeout(timeout)
          controller = null
        }
      }
    }, DEBOUNCE_MS)
  }
}
