import { geospatialMap, map } from '@defra/forms-engine-plugin/shared.js'
import { processLocation } from '~/node_modules/@defra/forms-engine-plugin/.server/client/javascripts/location-map.js'

const MAP_FIELDS = [
  '.app-location-field[data-locationtype="osgridreffield"]',
  '.app-location-field[data-locationtype="eastingnorthingfield"]',
  '.app-location-field[data-locationtype="latlongfield"]',
  '.app-geospatial-field'
].join(', ')
const DEFAULT_VIEW = { center: map.defaultConfig.center, zoom: map.defaultConfig.zoom }
const POSTCODE_LOOKUP_TIMEOUT_MS = 2000
const POSTCODE_VIEW_ZOOM = 10

const normalisePostcode = (postcode) => (typeof postcode === 'string' ? postcode.replace(/\s+/g, '').toUpperCase() : '')

/** Resolve a unique exact postcode; fuzzy or ambiguous results retain the UK view. */
async function findPostcodeCenter(postcode) {
  const controller = new window.AbortController()
  const timeout = window.setTimeout(() => controller.abort(), POSTCODE_LOOKUP_TIMEOUT_MS)

  try {
    const response = await fetch(`/api/geocode-proxy?query=${encodeURIComponent(postcode)}`, {
      signal: controller.signal
    })
    if (!response.ok) {
      return
    }

    const data = await response.json()
    const name = normalisePostcode(postcode)
    const matches = (data.results ?? [])
      .map((result) => result?.GAZETTEER_ENTRY)
      .filter(
        (entry) =>
          entry &&
          typeof entry.LOCAL_TYPE === 'string' &&
          entry.LOCAL_TYPE.toLowerCase() === 'postcode' &&
          normalisePostcode(entry.NAME1) === name
      )
    if (matches.length !== 1) {
      return
    }

    const { GEOMETRY_X: easting, GEOMETRY_Y: northing } = matches[0]
    if (
      !Number.isFinite(easting) ||
      !Number.isFinite(northing) ||
      easting < 0 ||
      easting > 700000 ||
      northing < 0 ||
      northing > 1300000
    ) {
      return
    }

    const { lat, long } = map.eastingNorthingToLatLong({ easting, northing })
    return Number.isFinite(lat) && Number.isFinite(long) ? [long, lat] : undefined
  } catch {
    // Postcode lookup is optional. The existing proxy logs upstream failures.
    return undefined
  } finally {
    window.clearTimeout(timeout)
  }
}

/** Close each asynchronously rendered help panel once, through its normal UI handler. */
function hideInitialHelpPanel(field) {
  const closePanel = () => {
    const panel = field.querySelector('.im-c-panel[id$="-panel-info"]')
    const button = panel?.querySelector('.im-c-panel__close')
    if (!(panel instanceof window.HTMLElement) || panel.hidden || !(button instanceof window.HTMLButtonElement)) {
      return
    }

    observer.disconnect()
    window.removeEventListener('pagehide', disconnect)
    button.click()
  }
  const observer = new window.MutationObserver(closePanel)
  const disconnect = () => observer.disconnect()
  observer.observe(field, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] })
  window.addEventListener('pagehide', disconnect, { once: true })
  closePanel()
}

/** Initialise YAML-defined forms maps with a postcode default, preserving the engine's saved-answer/view precedence. */
export async function initialiseComponentMaps() {
  if (!window.componentMapsEnabled) {
    return
  }

  const fields = [...document.querySelectorAll(MAP_FIELDS)]
  if (!fields.length) {
    return
  }

  const settings = document.getElementById('component-map-settings')
  const optionsByName = new Map(
    [...(settings?.querySelectorAll('[data-map-component]') ?? [])].map((element) => {
      const { mapComponent, hideMapHelpPanel, zoomToPostcode } = /** @type {HTMLElement} */ (element).dataset
      return [
        mapComponent,
        { hideMapHelpPanel: hideMapHelpPanel !== 'false', zoomToPostcode: zoomToPostcode !== 'false' }
      ]
    })
  )
  const optionsFor = (field) => {
    const name = field.querySelector('input[name], textarea[name]')?.getAttribute('name')?.split('__')[0]
    return optionsByName.get(name) ?? { hideMapHelpPanel: true, zoomToPostcode: true }
  }
  const postcode = settings?.dataset.mapPostcode?.trim().toUpperCase().replace(/\s+/g, ' ')
  const center =
    postcode && fields.some((field) => optionsFor(field).zoomToPostcode)
      ? await findPostcodeCenter(postcode)
      : undefined

  // Install the engine's submit protection once per form, including mixed map types.
  const forms = new Set(fields.map((field) => field.closest('form')).filter((form) => form !== null))
  forms.forEach((form) => {
    const buttons = Array.from(form.querySelectorAll('button'))
    form.addEventListener('submit', map.formSubmitFactory(buttons), false)
  })

  const initialise = (field, index, process) => {
    const options = optionsFor(field)
    Object.assign(
      map.defaultConfig,
      center && options.zoomToPostcode ? { center, zoom: POSTCODE_VIEW_ZOOM } : DEFAULT_VIEW
    )
    if (options.hideMapHelpPanel) {
      hideInitialHelpPanel(field)
    }
    process({ apiPath: '/api', assetPath: '/public/assets' }, field, index)
  }

  // Each engine helper copies the default synchronously; keep native indices for saved URL views.
  try {
    document.querySelectorAll('.app-location-field').forEach((field, index) => {
      if (field.matches(MAP_FIELDS)) {
        initialise(field, index, processLocation)
      }
    })
    document.querySelectorAll('.app-geospatial-field').forEach((field, index) => {
      initialise(field, index, geospatialMap.processGeospatial)
    })
  } finally {
    Object.assign(map.defaultConfig, DEFAULT_VIEW)
  }
}
