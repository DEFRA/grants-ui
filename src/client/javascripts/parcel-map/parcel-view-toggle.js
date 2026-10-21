export const PARCEL_VIEW_STORAGE_KEY = 'grants-ui-parcel-view'
export const PARCEL_SELECTION_STORAGE_KEY = 'grants-ui-parcel-view-selection'

/**
 * Carry an unsubmitted selection across the toggle's GET navigation only.
 * Consume it once, scope it to this journey URL and ignore unavailable parcels.
 * @param {HTMLElement} mapEl
 */
export function restoreParcelViewSelection(mapEl) {
  try {
    const saved = window.sessionStorage.getItem(PARCEL_SELECTION_STORAGE_KEY)
    window.sessionStorage.removeItem(PARCEL_SELECTION_STORAGE_KEY)
    if (!saved) {
      return
    }
    const { path, ids } = JSON.parse(saved)
    if (path !== window.location.pathname + window.location.search || !Array.isArray(ids)) {
      return
    }
    const inputs = [...document.querySelectorAll('#land-parcels input')].map(
      (input) => /** @type {HTMLInputElement} */ (input)
    )
    const selectedIds = inputs.filter((input) => ids.includes(input.value)).map((input) => input.value)
    inputs.forEach((input) => {
      input.checked = selectedIds.includes(input.value)
    })
    mapEl.dataset.selectedParcels = selectedIds.join(',')
  } catch {
    // Storage is optional; keep any selection rendered by the server.
  }
}

/**
 * Enhance the server-rendered list without changing the form's field names.
 * Only the active view's inputs submit, so the selection cannot be duplicated.
 * @param {object} options
 * @param {(ids: string[]) => void} options.onListSelection
 * @param {() => void} options.onMapView
 * @param {() => string[]} options.getSelectedIds - The page's current selection, whichever view made it.
 */
export function initParcelViewToggle({ onListSelection, onMapView, getSelectedIds }) {
  const list = document.getElementById('land-parcels')
  const map = document.getElementById('parcel-map-view')
  const link = document.getElementById('parcel-view-toggle')
  if (!list || !map || !link) {
    return null
  }
  document.getElementById('parcel-selection-map-hint')?.removeAttribute('hidden')
  const inputs = [...list.querySelectorAll('input')]
  const panels = [...list.querySelectorAll('[data-parcel-details]')]
  const path = window.location.pathname + window.location.search
  link.setAttribute('href', path)
  const errorLinks = [...document.querySelectorAll('.govuk-error-summary a[href="#land-parcels"]')]
  let view = 'map'
  try {
    view = window.localStorage.getItem(PARCEL_VIEW_STORAGE_KEY) === 'list' ? 'list' : 'map'
  } catch {
    // Browser storage can be unavailable. Switching still works for this visit.
  }

  /** @param {string[]} ids */
  const syncSelection = (ids) => {
    inputs.forEach((input) => {
      input.checked = ids.includes(input.value)
      input.setAttribute('aria-describedby', `${input.id}-hint${input.checked ? ` ${input.id}-details` : ''}`)
    })
    panels.forEach((panel) => {
      const element = /** @type {HTMLElement} */ (panel)
      element.hidden = !ids.includes(element.dataset.parcelDetails ?? '')
    })
  }

  const applyView = () => {
    const isMap = view === 'map'
    list.hidden = isMap
    map.hidden = !isMap
    document.body.classList.toggle('map-select-parcel--map', isMap)
    document.getElementById('parcel-map-details-view')?.toggleAttribute('hidden', !isMap)
    inputs.forEach((input) => {
      input.disabled = isMap
    })
    document.querySelectorAll('#selected-parcels-inputs input').forEach((input) => {
      ;/** @type {HTMLInputElement} */ (input).disabled = !isMap
    })
    link.textContent = isMap ? 'View parcels as a list' : 'View parcels on a map'
    errorLinks.forEach((errorLink) => errorLink.setAttribute('href', isMap ? '#parcel-map' : '#land-parcels'))
    if (isMap) {
      onMapView()
    }
  }

  list.addEventListener('change', () => {
    const ids = inputs.filter((input) => input.checked).map((input) => input.value)
    syncSelection(ids)
    onListSelection(ids)
  })
  link.addEventListener('click', (event) => {
    view = view === 'map' ? 'list' : 'map'
    try {
      window.localStorage.setItem(PARCEL_VIEW_STORAGE_KEY, view)
      window.sessionStorage.setItem(PARCEL_SELECTION_STORAGE_KEY, JSON.stringify({ path, ids: getSelectedIds() }))
      // Let the real link load this page with GET, including after a failed POST.
      // Do not initialise the destination view in the document being left.
    } catch {
      // If storage is blocked, switch in-page without losing the selection.
      event.preventDefault()
      applyView()
    }
  })

  syncSelection(inputs.filter((input) => input.checked).map((input) => input.value))
  applyView()
  document.getElementById('parcel-view-toggle-container')?.removeAttribute('hidden')

  return {
    errorLinks,
    syncSelection,
    isList: () => view === 'list',
    showList: () => {
      view = 'list'
      applyView()
    }
  }
}
