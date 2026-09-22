export const PARCELS_API_URL = '/api/map/parcels'
export const PARCEL_TILES_URL = '/api/map/parcel-tiles/{z}/{x}/{y}'

export const MAP_STYLE_URL = '/api/map/os-basemap'

export function getMapStyleAttribution() {
  return `© Crown copyright and database rights ${new Date().getFullYear()} OS`
}

export const TAG_NAME = 'parcel-map'

export const MULTI_SELECT_ATTRIBUTE = 'multi-select'
export const ENABLED_LAND_ACTIONS_ATTRIBUTE = 'data-enabled-land-actions'

const COLOR_GOV_UK_BLUE = '#1d70b8'
export const PARCEL_COLORS = [
  COLOR_GOV_UK_BLUE, // govuk-blue
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
export const AREA_DECIMAL_PLACES = 4
export const TOTAL_AREA_DECIMAL_PLACES = 4

// Feature property carrying the compound "SHEET-PARCEL" ID, stamped onto the
// vector tiles by the grants-ui tile proxy. The interact plugin uses it to
// identify features and label them in the keyboard-accessible listbox.
export const PARCEL_ID_PROPERTY = 'id'

// Pixel radius for parcel hit-testing. The interact plugin only matches
// polygons on exact geometric containment, so the provider falls back to a
// rendered-pixel query within this radius — otherwise small (zoomed-out)
// parcels are practically unclickable.
export const PARCEL_CLICK_TOLERANCE_PX = 10
export const SOURCE_ID_PARCELS = 'parcels'
// GeoJSON source the label layer reads from — one deduplicated point per
// parcel id, rebuilt on 'idle' by parcel-map-labels.js.
export const SOURCE_ID_PARCEL_LABELS = 'parcels-labels'

export const LAYER_ID_FILL = 'parcels-fill'
export const LAYER_ID_OUTLINE = 'parcels-outline'
export const LAYER_ID_LABEL = 'parcels-label'
export const LAYER_ID_LABEL_CLUSTER = 'parcels-label-cluster'
export const LAYER_ID_LABEL_CLUSTER_COUNT = 'parcels-label-cluster-count'

export const LABEL_CLUSTER_RADIUS_PX = 85
export const LABEL_CLUSTER_MAX_ZOOM = 10
export const LABEL_CLUSTER_COLOR = COLOR_GOV_UK_BLUE
export const LABEL_CLUSTER_RADIUS = 14
export const LABEL_CLUSTER_TEXT_COLOR = '#ffffff'
// Zoom ceiling when fitting to a clicked cluster's bounds — kept separate
// from LABEL_CLUSTER_MAX_ZOOM, which is too low to double as this cap.
export const CLUSTER_EXPAND_MAX_ZOOM = 14

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
export const SELECT_FEATURE_EVENT = 'interact:selectFeature'
export const SELECT_LISTENER_POLL_MS = 20
export const SELECT_LISTENER_MAX_POLLS = 25

export const EVENT_READY = 'parcel-map:ready'
export const EVENT_ERROR = 'parcel-map:error'
export const EVENT_SELECTION = 'parcel-map:selection'

export const ERROR_REASON_UNAVAILABLE = 'unavailable'
export const ERROR_REASON_NO_PARCELS = 'no-parcels'

const POSITION_ABSOLUTE = 'position:absolute'

export const ERROR_OVERLAY_STYLES = [
  POSITION_ABSOLUTE,
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
  POSITION_ABSOLUTE,
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

export const SHOW_ALL_ICON_SVG =
  '<svg class="map-reset-view-button__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M8 4H4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<path d="M16 4h4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<path d="M8 20H4v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<path d="M16 20h4v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<rect x="7" y="7" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"></rect>' +
  '</svg>'

// Screen-pixel drift before "Show all parcels" appears; filters out incidental nudges.
export const SHOW_ALL_MOVE_THRESHOLD_PX = 100
export const ZOOM_DRIFT_TOLERANCE = 0.1

export const MSG_SHOW_ALL_PARCELS = 'Show all parcels'
export const MSG_SHOW_ALL_PARCELS_AVAILABLE = 'Show all parcels button now available'

// Layout only — background/border/box-shadow/hover/focus live in
// SHOW_ALL_BUTTON_FOCUS_STYLE so :hover/:focus can override them.
export const SHOW_ALL_BUTTON_STYLES = [
  POSITION_ABSOLUTE,
  'top:12px',
  'left:12px',
  'z-index:2',
  'align-items:center',
  'gap:8px',
  'margin:0',
  'padding:8px 12px',
  'font-size:16px',
  'font-weight:400',
  'line-height:1.25',
  'font-family:GDS Transport,arial,sans-serif',
  'color:#0b0c0c',
  'cursor:pointer'
].join(';')

export const SHOW_ALL_BUTTON_CLASS = 'map-reset-view-button'

export const SHOW_ALL_BUTTON_FOCUS_STYLE = `
  .${SHOW_ALL_BUTTON_CLASS} {
    background: #ffffff;
    border: 2px solid #0b0c0c;
    box-shadow: 0 2px 4px rgba(11,12,12,0.15);
  }
  .${SHOW_ALL_BUTTON_CLASS}:hover {
    background-color: var(--button-hover-color);
  }
  .${SHOW_ALL_BUTTON_CLASS}:focus {
    outline: 3px solid transparent;
    box-shadow: 0 0 0 3px #ffdd00, 0 2px 4px rgba(11,12,12,0.15);
  }
`

// Matches the library's own maxMobileWidth default. @defra/interactive-map's
// own fullscreen button (enableFullscreen) has no mobile-only visibility
// option, so it's hidden above this width via its stable rendered class.
export const FULLSCREEN_BUTTON_MAX_WIDTH_PX = 640

export const FULLSCREEN_BUTTON_VISIBILITY_STYLE = `
  @media (min-width: ${FULLSCREEN_BUTTON_MAX_WIDTH_PX + 1}px) {
    .im-c-button-wrapper--fullscreen {
      display: none;
    }
  }
`

// Set on the map's app root by the pseudo-fullscreen fallback (parcel-map-init.js)
// for browsers without Element.requestFullscreen (e.g. iOS Safari).
export const PSEUDO_FULLSCREEN_CLASS = 'parcel-map-pseudo-fullscreen'

// Dispatched on document whenever PSEUDO_FULLSCREEN_CLASS toggles, since no
// native fullscreenchange event fires for it.
export const EVENT_PSEUDO_FULLSCREEN_CHANGE = 'parcel-map:pseudo-fullscreen-change'
