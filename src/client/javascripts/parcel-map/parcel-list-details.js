import { PARCEL_DETAILS_LOADING_DELAY_MS, PARCEL_DETAILS_LOADING_MIN_DURATION_MS } from './config.js'

const LOADING_MESSAGE = 'Loading available actions and requirements…'
const ERROR_MESSAGE =
  'We could not load the available actions and requirements. Continue to check them on the next page.'
// Matches the visible no-actions inset text in parcel-list.html and map-select-parcel.html.
const NO_ACTIONS_MESSAGE =
  'There are no actions available for this land parcel. Select another land parcel to continue.'

/**
 * @typedef {{ intro: string, items: string[], actionCount?: number }} ParcelNotice
 */

/**
 * Replace a list's bullets with the requirement items.
 * textContent, never innerHTML: this copy arrives over fetch.
 * @param {Element | null | undefined} listEl
 * @param {string[]} items
 */
export function renderRequirementItems(listEl, items) {
  listEl?.replaceChildren(
    ...items.map((item) => {
      const li = document.createElement('li')
      li.textContent = item
      return li
    })
  )
}

/**
 * One utterance for the requirements: the intro alone tells a screen-reader user nothing.
 * @param {ParcelNotice | null | undefined} notice
 */
export function requirementsText(notice) {
  return notice?.items.length ? `${notice.intro} ${notice.items.join(', ')}` : ''
}

/**
 * Words the action count the same way as the visible details.
 * @param {number | undefined} actionCount
 */
function actionCountText(actionCount) {
  if (typeof actionCount !== 'number') {
    return ''
  }
  if (actionCount === 0) {
    return NO_ACTIONS_MESSAGE
  }
  return `${actionCount} available action${actionCount === 1 ? '' : 's'}.`
}

/** @param {string} parcelId */
const findPanel = (parcelId) =>
  [...document.querySelectorAll('[data-parcel-details]')].find(
    (element) => /** @type {HTMLElement} */ (element).dataset.parcelDetails === parcelId
  )

/**
 * @param {Element} panel
 * @param {ParcelNotice | null} notice
 * @param {string} statusText
 */
function renderPanel(panel, notice, statusText) {
  /** @param {string} selector @param {boolean} hidden */
  const hide = (selector, hidden) => panel.querySelector(selector)?.toggleAttribute('hidden', hidden)
  /** @param {string} selector @param {string} value */
  const text = (selector, value) => {
    const element = panel.querySelector(selector)
    if (element) {
      element.textContent = value
    }
  }
  const actionCount = notice?.actionCount
  hide('[data-parcel-actions-row]', typeof actionCount !== 'number')
  text('[data-parcel-action-count]', typeof actionCount === 'number' ? String(actionCount) : '')
  hide('[data-parcel-no-actions]', actionCount !== 0)
  hide('[data-parcel-requirements-row]', !notice?.items.length)
  text('[data-parcel-requirements-intro]', notice?.intro ?? '')
  renderRequirementItems(panel.querySelector('[data-parcel-requirements-list]'), notice?.items ?? [])
  hide('[data-parcel-details-status]', !!notice || !statusText)
  text('[data-parcel-details-status-text]', notice ? '' : statusText)
}

/** @param {string} value */
const announce = (value) => {
  const status = document.getElementById('parcel-list-status')
  if (status && !document.getElementById('land-parcels')?.hidden) {
    status.textContent = value
  }
}

/**
 * Update the selected parcel's information without moving keyboard focus.
 * @param {string} parcelId
 * @param {ParcelNotice | null} notice
 * @param {string} [statusText]
 */
function renderParcelListDetails(parcelId, notice, statusText = ERROR_MESSAGE) {
  const panel = findPanel(parcelId)
  if (!panel) {
    return
  }
  renderPanel(panel, notice, statusText)
  announce(
    notice ? [actionCountText(notice.actionCount), requirementsText(notice)].filter(Boolean).join(' ') : statusText
  )
}

/**
 * Avoid flashing loading feedback for quick requests, and keep it readable
 * once shown. Only list rendering waits: API requests and map updates do not.
 * Cancelling on selection changes prevents a previous parcel's timer from
 * overwriting the current parcel's live announcement.
 */
export function createParcelListDetailsRenderer() {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  /** @type {string | undefined} */
  let loadingParcelId
  /** @type {number | undefined} */
  let shownAt

  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
    loadingParcelId = undefined
    shownAt = undefined
  }

  // No single parcel is selected: drop pending feedback and any details shown
  // for a previous selection, which multi-select would otherwise leave visible.
  const clear = () => {
    cancel()
    document.querySelectorAll('[data-parcel-details]').forEach((panel) => renderPanel(panel, null, ''))
    announce('')
  }

  /** @param {string} parcelId */
  const startLoading = (parcelId) => {
    cancel()
    loadingParcelId = parcelId
    renderParcelListDetails(parcelId, null, '')
    timer = setTimeout(() => {
      shownAt = Date.now()
      renderParcelListDetails(parcelId, null, LOADING_MESSAGE)
    }, PARCEL_DETAILS_LOADING_DELAY_MS)
  }

  /** @param {string} parcelId @param {ParcelNotice | null} notice */
  const render = (parcelId, notice) => {
    const remaining =
      loadingParcelId === parcelId && shownAt !== undefined
        ? Math.max(0, PARCEL_DETAILS_LOADING_MIN_DURATION_MS - (Date.now() - shownAt))
        : 0
    clearTimeout(timer)
    const finish = () => {
      cancel()
      renderParcelListDetails(parcelId, notice)
    }
    if (remaining > 0) {
      timer = setTimeout(finish, remaining)
    } else {
      finish()
    }
  }

  return { startLoading, render, clear }
}
