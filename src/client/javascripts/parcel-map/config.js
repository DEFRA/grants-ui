export const PARCELS_API_URL = '/api/map/parcels'
export const PARCEL_TILES_URL = '/api/map/parcel-tiles/{z}/{x}/{y}'
export const PARCELS_GEOJSON_URL = '/api/map/parcels/geojson'

export const BASEMAP_PROVIDER_ORDNANCE_SURVEY = 'ordnance-survey'
export const DEFAULT_BASEMAP_PROVIDER = BASEMAP_PROVIDER_ORDNANCE_SURVEY

export const MAP_STYLE_URL = '/api/map/os-basemap'

export function getMapStyleAttribution() {
  return `© Crown copyright and database rights ${new Date().getFullYear()} OS`
}

// --- TEMPORARY: OS Maps vs OpenStreetMap comparison (TGC-1418 follow-up) ---
// Delete this block, BASEMAP_PROVIDER_OPENSTREETMAP's usages in index.js, and
// the toggle in map-select-parcel.html once the comparison is complete.
export const BASEMAP_PROVIDER_OPENSTREETMAP = 'openstreetmap'
export const OSM_STYLE_URL = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'
export const OSM_STYLE_ATTRIBUTION = '© OpenStreetMap contributors © CARTO'
// --- END TEMPORARY ---

export const PARCEL_COLORS = [
  '#1d70b8', // govuk-blue
  '#d4351c', // govuk-red
  '#f47738', // govuk-orange
  '#4c2c92', // govuk-purple
  '#005a30', // govuk-green
  '#28a197', // govuk-turquoise
  '#b58840' // govuk-yellow (accessible variant)
]

export const LAYER_TEXT_SIZE = 11
export const LAYER_TEXT_HALO_WIDTH = 1.5
export const LAYER_LINE_WIDTH = 1.5
export const FIT_BOUNDS_PADDING = 40
export const AREA_DECIMAL_PLACES = 2

// Feature property carrying the compound "SHEET-PARCEL" ID. Present in both the
// vector tiles (stamped on by the grants-ui tile proxy) and the mock GeoJSON.
// The interact plugin uses it to identify features and label them in the
// keyboard-accessible listbox.
export const PARCEL_ID_PROPERTY = 'id'

// Pixel radius for parcel hit-testing. The interact plugin only matches
// polygons on exact geometric containment, so the provider falls back to a
// rendered-pixel query within this radius — otherwise small (zoomed-out)
// parcels are practically unclickable.
export const PARCEL_CLICK_TOLERANCE_PX = 10

export const LAYER_ID_FILL = 'parcels-fill'
export const LAYER_ID_OUTLINE = 'parcels-outline'
export const LAYER_ID_LABEL = 'parcels-label'

export const FILL_OPACITY_DEFAULT = 0.2
export const FILL_OPACITY_SELECTED = 0.5
export const MAP_DEFAULT_HEIGHT = '500px'
export const MAP_DEFAULT_LNG = -1.5
export const MAP_DEFAULT_LAT = 52.5
export const MAP_DEFAULT_CENTER = /** @type {[number, number]} */ ([MAP_DEFAULT_LNG, MAP_DEFAULT_LAT])
export const MAP_DEFAULT_ZOOM = 12
// The OS raster basemap only exists for zooms 7–20 (mirrors OS_MIN_ZOOM in
// map.plugin.js). Constrain the map so users can't zoom out into blank void.
export const MAP_MIN_ZOOM = 7
export const MAP_LOAD_TIMEOUT_MS = 10000
export const FETCH_MAX_ATTEMPTS = 2
export const FETCH_RETRY_DELAY_MS = 1000
export const TOOLTIP_OFFSET_X = 12
export const TOOLTIP_MAX_WIDTH = 248
export const TOOLTIP_FALLBACK_MAP_WIDTH = 500

export const LABEL_TEXT_COLOR = '#0b0c0c'
export const LABEL_HALO_COLOR = '#ffffff'

export const SELECTION_NONE_SENTINEL = '__none__'

// Accessible name for the map viewport (role="application"), announced by screen readers on focus
export const MAP_LABEL = 'Map of your land parcels. Select a parcel to apply for actions on it.'

export const MSG_LOADING = 'Loading map…'
export const MSG_ERROR_UNAVAILABLE = 'There was a problem loading the map.'
export const MSG_UNKNOWN_PARCEL = 'Unknown parcel'
export const MSG_UNKNOWN_AREA = 'Unknown'

export const TOOLTIP_VERTICAL_OFFSET = 10

export const STATE_IDLE = 'idle'
export const STATE_LOADING = 'loading'
export const STATE_READY = 'ready'
export const STATE_ERROR = 'error'

export const EVENT_READY = 'parcel-map:ready'
export const EVENT_ERROR = 'parcel-map:error'
export const EVENT_SELECTION = 'parcel-map:selection'

export const ERROR_OVERLAY_STYLES = [
  'position:absolute',
  'inset:0',
  'background:#f3f2f1',
  'border:2px solid #b1b4b6',
  'border-radius:4px',
  'display:flex',
  'align-items:center',
  'justify-content:center',
  'z-index:1'
].join(';')

export const ERROR_LABEL_STYLES = 'font-family:GDS Transport,arial,sans-serif;font-size:16px;color:#505a5f'

export const TOOLTIP_STYLES = [
  'position:absolute',
  'z-index:9999',
  'background:#fff',
  'border:2px solid #b1b4b6',
  'border-radius:4px',
  'padding:12px 14px',
  'font-size:14px',
  'font-family:GDS Transport,arial,sans-serif',
  'line-height:1.4',
  'max-width:220px',
  'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
  'pointer-events:none',
  'display:none'
].join(';')
