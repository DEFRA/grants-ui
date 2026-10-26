export const PARCELS_API_URL = '/api/map/parcels'
export const PARCEL_SEARCH_URL = '/api/map/parcels/search'
export const PARCEL_BBOX_URL = '/api/map/parcels/{parcelId}/bbox'
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
// parcel id, rebuilt on 'idle' by labels.js.
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
// Zoom ceiling when framing a searched parcel; the basemap is unreadable beyond it.
export const SEARCH_FIT_MAX_ZOOM = 18

export const FILL_OPACITY_DEFAULT = 0.2
export const FILL_OPACITY_SELECTED = 0.5
export const MAP_DEFAULT_HEIGHT = '500px'
export const MAP_DEFAULT_LNG = -1.5
export const MAP_DEFAULT_LAT = 52.5
export const MAP_DEFAULT_CENTER = /** @type {[number, number]} */ ([MAP_DEFAULT_LNG, MAP_DEFAULT_LAT])
export const MAP_DEFAULT_ZOOM = 12
// The OS raster basemap starts at zoom 7 (mirrors OS_MIN_ZOOM in os-maps.js).
// Constrain the map so users can't zoom out into blank void.
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

export const SEARCH_MATCH_EVENT = 'search:match'
export const SEARCH_OPEN_EVENT = 'search:open'
// The vendor search plugin's DOM: its open button, form, input, results list
// and the status panel it shows under the input.
export const SEARCH_OPEN_BUTTON_SELECTOR = 'button[aria-controls$="-search-form"]'
export const SEARCH_FORM_SELECTOR = '[id$="-search-form"]'
export const SEARCH_INPUT_SELECTOR = 'input[id$="-search-input"]'
export const SEARCH_SUGGESTIONS_SELECTOR = '.im-c-search-suggestions'
export const CLASS_SEARCH_STATUS = 'im-c-search__status'
// Lets _parcel-map.scss size the results list to the map.
export const CSS_VAR_MAP_HEIGHT = '--parcel-map-height'

export const EVENT_READY = 'parcel-map:ready'
export const EVENT_ERROR = 'parcel-map:error'
export const EVENT_SELECTION = 'parcel-map:selection'

// On EVENT_SELECTION; the page does not scroll for a search pick.
export const SELECTION_SOURCE_MAP = 'map'
export const SELECTION_SOURCE_SEARCH = 'search'

export const SEARCH_PLACEHOLDER = 'Search by parcel ID'
export const MSG_SEARCH_NO_RESULTS = 'No matching land parcels'
export const MSG_SEARCH_ERROR = 'Search is unavailable'

export const ERROR_REASON_UNAVAILABLE = 'unavailable'
export const ERROR_REASON_NO_PARCELS = 'no-parcels'

// Styled in src/client/stylesheets/components/_parcel-map.scss.
export const CLASS_WRAPPER = 'parcel-map__wrapper'
export const CLASS_CANVAS = 'parcel-map__canvas'
export const CLASS_OVERLAY = 'parcel-map__overlay'
export const CLASS_OVERLAY_LABEL = 'parcel-map__overlay-label'
export const CLASS_TOOLTIP = 'parcel-map__tooltip'
export const CLASS_TOOLTIP_TITLE = 'parcel-map__tooltip-title'
export const CLASS_TOOLTIP_ROW = 'parcel-map__tooltip-row'
export const CLASS_VISUALLY_HIDDEN = 'govuk-visually-hidden'
export const SHOW_ALL_BUTTON_CLASS = 'map-reset-view-button'

export const SHOW_ALL_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="im-c-icon">' +
  '<path d="M3 7V5a2 2 0 0 1 2-2h2"></path>' +
  '<path d="M17 3h2a2 2 0 0 1 2 2v2"></path>' +
  '<path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>' +
  '<path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>' +
  '</svg>'

// Screen-pixel drift before "View all land parcels" appears; filters out incidental nudges.
export const SHOW_ALL_MOVE_THRESHOLD_PX = 100
export const ZOOM_DRIFT_TOLERANCE = 0.1

export const MSG_SHOW_ALL_PARCELS = 'View all land parcels'
export const MSG_SHOW_ALL_PARCELS_AVAILABLE = 'View all land parcels button now available'
