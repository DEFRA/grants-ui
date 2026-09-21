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

export const MSG_SHOW_ALL_PARCELS = 'Show all parcels'
export const MSG_SHOW_ALL_PARCELS_AVAILABLE = 'Show all parcels button now available'

export const SHOW_ALL_BUTTON_STYLES = [
  'position:absolute',
  'top:16px',
  'left:16px',
  'z-index:2',
  'align-items:center',
  'gap:6px',
  'background:#fff',
  'border:2px solid #0b0c0c',
  'border-radius:4px',
  'padding:8px 12px',
  'font-size:16px',
  'font-family:GDS Transport,arial,sans-serif',
  'color:#0b0c0c',
  'cursor:pointer'
].join(';')

export const SHOW_ALL_BUTTON_CLASS = 'parcel-map-show-all-button'

// GOV.UK's govuk-focused-box focus style.
export const SHOW_ALL_BUTTON_FOCUS_STYLE = `
  .${SHOW_ALL_BUTTON_CLASS} {
    box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  }
  .${SHOW_ALL_BUTTON_CLASS}:focus {
    outline: 3px solid transparent;
    box-shadow: 0 0 0 4px #ffdd00, 0 0 0 8px #0b0c0c;
  }
`
