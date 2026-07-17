// TEMPORARY: OS Maps vs OpenStreetMap comparison.
// Delete this file, its webpack entry, and its <script> tag in
// map-select-parcel.html once the comparison is complete.
import { BASEMAP_PROVIDER_ATTRIBUTE } from './config.js'
import { EVENT_METRICS_UPDATE } from './basemap-metrics.js'

const METRICS_LABEL = { 'ordnance-survey': 'OS Maps', openstreetmap: 'OpenStreetMap' }

/**
 * Render a metrics snapshot as the compact readout line next to the toggle.
 * @param {BasemapMetrics} m
 * @returns {string}
 */
export function formatMetrics(m) {
  /** @type {string | null} */
  let size
  if (m.bytesTransferred > 0) {
    size = `${Math.round(m.bytesTransferred / 1024)}KB`
  } else if (m.loadMs !== null) {
    size = 'size not measurable'
  } else {
    size = null
  }

  /** @type {string | null} */
  let errors = null
  if (m.tileErrors > 0) {
    const plural = m.tileErrors === 1 ? '' : 's'
    errors = `${m.tileErrors} error${plural}`
  }

  const parts = [
    METRICS_LABEL[m.provider] || m.provider,
    m.firstTileMs !== null ? `${m.firstTileMs}ms to first tile` : null,
    m.loadMs === null ? 'loading…' : `${m.loadMs}ms to idle`,
    `${m.tileRequests} tile${m.tileRequests === 1 ? '' : 's'}`,
    size,
    errors
  ]
  return parts.filter(Boolean).join(' · ')
}

/**
 * Wire the basemap radio toggle and metrics readout to a <parcel-map> element.
 * No-op when the devMode toggle markup isn't present on the page.
 * @param {HTMLElement | null} mapEl
 */
export function initBasemapComparison(mapEl) {
  if (!mapEl) {
    return
  }
  const toggle = document.getElementById('basemap-provider-toggle')
  if (!toggle) {
    return
  }
  const metricsEl = document.getElementById('basemap-metrics')

  toggle.addEventListener('change', (/** @type {Event} */ e) => {
    if (/** @type {HTMLInputElement | null} */ (e.target)?.name === 'basemapProviderDisplay') {
      if (metricsEl) {
        metricsEl.textContent = ''
      }
      mapEl.setAttribute(BASEMAP_PROVIDER_ATTRIBUTE, /** @type {HTMLInputElement} */ (e.target).value)
    }
  })

  mapEl.addEventListener(EVENT_METRICS_UPDATE, (/** @type {Event} */ e) => {
    if (metricsEl) {
      metricsEl.textContent = formatMetrics(/** @type {CustomEvent<BasemapMetrics>} */ (e).detail)
    }
  })
}

initBasemapComparison(document.getElementById('parcel-map'))

/**
 * @typedef {object} BasemapMetrics
 * @property {string} provider
 * @property {number} tileRequests
 * @property {number} tileErrors
 * @property {number | null} loadMs
 * @property {number | null} firstTileMs
 * @property {number} bytesTransferred
 */
