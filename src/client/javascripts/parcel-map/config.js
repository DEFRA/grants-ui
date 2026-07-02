export const PARCELS_API_URL = '/api/map/parcels'
export const MAP_STYLE_URL = '/api/map/os-basemap'
export const MAP_STYLE_ATTRIBUTION = `© Crown copyright and database rights ${new Date().getFullYear()} OS`

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

export const LAYER_ID_FILL = 'parcels-fill'
export const LAYER_ID_OUTLINE = 'parcels-outline'
export const LAYER_ID_LABEL = 'parcels-label'

export const FILL_OPACITY_DEFAULT = 0.2
export const FILL_OPACITY_SELECTED = 0.5
export const MAP_DEFAULT_HEIGHT = '500px'
export const MAP_LOAD_TIMEOUT_MS = 10000
export const FETCH_MAX_ATTEMPTS = 2
export const FETCH_RETRY_DELAY_MS = 1000
export const TOOLTIP_OFFSET_X = 12
export const TOOLTIP_MAX_WIDTH = 248
export const TOOLTIP_FALLBACK_MAP_WIDTH = 500

export const LABEL_TEXT_COLOR = '#0b0c0c'
export const LABEL_HALO_COLOR = '#ffffff'

export const SELECTION_NONE_SENTINEL = '__none__'

export const MSG_LOADING = 'Loading map…'
export const MSG_ERROR_UNAVAILABLE = 'There was a problem loading the map.'
export const MSG_ERROR_NO_PARCELS = 'No land parcels were found for your account.'
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
