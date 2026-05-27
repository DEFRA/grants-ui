export const PARCELS_API_URL = '/api/map/parcels'
export const MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'
export const MAP_STYLE_ATTRIBUTION = '© OpenStreetMap contributors © CARTO'

export const PARCEL_COLORS = [
  '#1d70b8', // govuk-blue
  '#d4351c', // govuk-red
  '#f47738', // govuk-orange
  '#4c2c92', // govuk-purple
  '#005a30', // govuk-green
  '#28a197', // govuk-turquoise
  '#b58840'  // govuk-yellow (accessible variant)
]

export const LAYER_TEXT_SIZE = 11
export const LAYER_TEXT_HALO_WIDTH = 1.5

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
