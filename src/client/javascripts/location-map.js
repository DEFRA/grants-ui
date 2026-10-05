import { map as mapHelpers } from '@defra/forms-engine-plugin/shared.js'
import { isValidEastingNorthing } from './map-coordinate-utils.js'

const ANSWER_VIEW_ZOOM = '16'
const LAT_LONG_PRECISION = 7
const MIN_LATITUDE = 49.85
const MAX_LATITUDE = 60.859
const MIN_LONGITUDE = -13.687
const MAX_LONGITUDE = 1.767
const OS_GRID_REFERENCE_PATTERN = /^([a-z]{2})\s?((?:\d\d){3,5}|\d{3}\s\d{3}|\d{4}\s\d{4}|\d{5}\s\d{5})$/i
const OS_GRID_SQUARE_LETTERS = {
  S: 'ABCDEFGHJKLMNOPQRSTUVWXYZ',
  N: 'ABCDEFGHJKLMNOPQRSTUVWXYZ',
  T: 'ABFGLMQRVW',
  O: 'ABFGLMQRVW',
  H: 'LMNOPQRSTUVWXYZ',
  J: 'LMQRVW'
}

function readLatLong(inputs) {
  const lat = Number(inputs[0].value.trim())
  const long = Number(inputs[1].value.trim())
  const validLatitude = lat >= MIN_LATITUDE && lat <= MAX_LATITUDE
  const validLongitude = long >= MIN_LONGITUDE && long <= MAX_LONGITUDE
  return lat && long && validLatitude && validLongitude ? { lat, long } : undefined
}

function readEastingNorthing(inputs) {
  const easting = Number(inputs[0].value.trim())
  const northing = Number(inputs[1].value.trim())
  return easting && northing && isValidEastingNorthing({ easting, northing })
    ? mapHelpers.eastingNorthingToLatLong({ easting, northing })
    : undefined
}

function readOsGridReference(inputs) {
  const value = inputs[0].value
  const match = OS_GRID_REFERENCE_PATTERN.exec(value)
  if (!match) {
    return undefined
  }
  const [first, second] = match[1].toUpperCase()
  return OS_GRID_SQUARE_LETTERS[first]?.includes(second) ? mapHelpers.osGridRefToLatLong(value) : undefined
}

const LOCATION_TYPES = {
  latlongfield: {
    inputCount: 2,
    read: readLatLong,
    write(inputs, point) {
      inputs[0].value = point.lat.toFixed(LAT_LONG_PRECISION)
      inputs[1].value = point.long.toFixed(LAT_LONG_PRECISION)
    }
  },
  eastingnorthingfield: {
    inputCount: 2,
    read: readEastingNorthing,
    write(inputs, point) {
      const { easting, northing } = mapHelpers.latLongToEastingNorthing(point)
      inputs[0].value = easting.toFixed(0)
      inputs[1].value = northing.toFixed(0)
    }
  },
  osgridreffield: {
    inputCount: 1,
    read: readOsGridReference,
    write(inputs, point) {
      inputs[0].value = mapHelpers.latLongToOsGridRef(point)
    }
  }
}

function addHelpPanel(map) {
  const layout = { slot: 'drawer', open: true, dismissible: true, modal: false }
  map.addPanel('info', {
    focus: false,
    showLabel: true,
    label: 'How to use the map',
    mobile: { ...layout },
    tablet: { ...layout },
    desktop: { ...layout },
    html:
      '<ul><li>Search for a place or postcode</li><li>Use the + and - icons to zoom in and out</li>' +
      '<li>Use a mouse or keyboard to centre the point at the location</li><li>Click to add the location to the map</li></ul>'
  })
}

/** Initialise and bind a location field using the forms engine's public map helpers. */
export function processLocation(config, location, index) {
  if (!(location instanceof window.HTMLDivElement)) {
    return
  }
  const locationInputs = location.querySelector('.app-location-field-inputs')
  const type = LOCATION_TYPES[location.dataset.locationtype ?? '']
  if (!(locationInputs instanceof window.HTMLDivElement) || !type) {
    return
  }
  const inputs = [...location.querySelectorAll('input.govuk-input')]
  if (inputs.length !== type.inputCount) {
    throw new Error(`Expected ${type.inputCount} inputs for ${location.dataset.locationtype}`)
  }

  const point = type.read(inputs)
  /** @type {[number, number] | undefined} */
  const center = point ? [point.long, point.lat] : undefined
  const initConfig = center
    ? { zoom: ANSWER_VIEW_ZOOM, center, markers: [{ id: 'location', coords: center }] }
    : mapHelpers.defaultConfig
  const container = document.createElement('div')
  container.id = `map_${index}`
  container.className = 'map-container'
  locationInputs.after(container)
  const { map, interactPlugin } = mapHelpers.createMap(container.id, initConfig, config)
  map.on(mapHelpers.EVENTS.mapReady, ({ map: provider }) => {
    map.on(mapHelpers.EVENTS.interactMarkerChange, ({ coords: [long, lat] }) => {
      type.write(inputs, { lat, long })
    })
    const updateMap = () => {
      const updatedPoint = type.read(inputs)
      if (updatedPoint) {
        mapHelpers.centerMap(map, provider, [updatedPoint.long, updatedPoint.lat])
      }
    }
    inputs.forEach((input) => input.addEventListener('change', updateMap, false))
    addHelpPanel(map)
    interactPlugin.enable()
  })
}
