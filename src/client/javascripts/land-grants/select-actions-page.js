// Live action-availability refresh for the select-actions page. As the user
// checks/unchecks actions or edits a quantity, sends the in-progress
// selection to the server, then greys out any other action no longer
// available. A selected action is never disabled by its own response.
const QUANTITY_FIELD_PREFIX = 'landActionQuantity_'
const CHECKBOX_NAME = 'landAction'
const QUANTITY_DEBOUNCE_MS = 500
const UNAVAILABLE_MESSAGE = 'Not compatible with other selected actions.'
const UNAVAILABLE_CLASS = 'select-actions-unavailable-message'
const AVAILABLE_UNIT_ATTR = 'data-available-unit'
const TOTAL_AVAILABLE_AREA_ATTR = 'data-total-available-area'

// Mirrors ~/src/server/land-grants/utils/format-area-unit.js - client JS is
// bundled separately and can't import from src/server/.
const AREA_UNIT_FULL_NAMES = {
  sqm: 'square metres',
  m2: 'square metres',
  sqkm: 'square kilometres',
  km2: 'square kilometres',
  sqft: 'square feet',
  ft2: 'square feet',
  sqyd: 'square yards',
  yd2: 'square yards',
  sqmi: 'square miles',
  mi2: 'square miles',
  ha: 'hectares',
  are: 'ares',
  ac: 'acres'
}

/** @param {string} actionCode */
const quantityFieldId = (actionCode) => `${QUANTITY_FIELD_PREFIX}${actionCode}`

/** @param {string} [abbrev] */
const formatAreaUnit = (abbrev = '') => AREA_UNIT_FULL_NAMES[abbrev.trim().toLowerCase()] ?? abbrev

/**
 * @param {number} value
 * @param {string} unit
 */
const availabilityHintText = (value, unit) => `${value} ${formatAreaUnit(unit)} available`

/**
 * @template {unknown[]} T
 * @param {(...args: T) => void} fn
 * @param {number} delayMs
 * @returns {(...args: T) => void}
 */
function debounce(fn, delayMs) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delayMs)
  }
}

/** @param {HTMLElement} form */
function getCheckboxes(form) {
  return /** @type {HTMLInputElement[]} */ (
    Array.from(form.querySelectorAll(`input[type="checkbox"][name="${CHECKBOX_NAME}"]`))
  )
}

/** @param {HTMLInputElement} checkbox */
function getQuantityInput(checkbox) {
  return /** @type {HTMLInputElement | null} */ (document.getElementById(quantityFieldId(checkbox.value)))
}

/**
 * The action's original, full available area - set once at page render and
 * never overwritten client-side.
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getTotalAvailableArea(checkbox) {
  const value = Number(checkbox.getAttribute(TOTAL_AVAILABLE_AREA_ATTR))
  return Number.isFinite(value) ? value : undefined
}

/**
 * Whatever's validly typed into an action's own quantity field right now -
 * undefined if there's no quantity input, nothing typed, or the typed value
 * isn't a positive number within the action's total available area.
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getValidTypedQuantity(checkbox) {
  const typed = Number(getQuantityInput(checkbox)?.value.trim())
  const total = getTotalAvailableArea(checkbox)
  return typed > 0 && (total == null || typed <= total) ? typed : undefined
}

/**
 * Instantly updates a quantity input's own hint to total-minus-typed, so the
 * user isn't left wondering what the total was after typing 0 - overwritten
 * again once the debounced API refresh responds (see applyAvailability).
 * @param {HTMLInputElement} checkbox
 */
function updateHintLive(checkbox) {
  const quantityInput = getQuantityInput(checkbox)
  const total = getTotalAvailableArea(checkbox)
  const unit = checkbox.getAttribute(AVAILABLE_UNIT_ATTR)
  const hint = quantityInput && document.getElementById(`${quantityInput.id}-hint`)
  if (!quantityInput || total == null || !unit || !hint) {
    return
  }
  const typed = Number(quantityInput.value.trim())
  // Round to 4dp to absorb float noise (e.g. 0.3271 - 0.2 !== 0.1271 in JS)
  // without truncating genuine precision the API's area values carry.
  const remaining = typed > 0 ? Math.max(0, Math.round((total - typed) * 10000) / 10000) : total
  hint.textContent = availabilityHintText(remaining, unit)
}

/**
 * Builds the plannedActions payload from the current DOM state: every
 * checked action, with its quantity.
 * @param {HTMLElement} form
 * @returns {Array<{ actionCode: string, quantity: number, unit: string }>}
 */
function buildPlannedActions(form) {
  const plannedActions = []
  for (const checkbox of getCheckboxes(form)) {
    if (!checkbox.checked) {
      continue
    }
    const quantityInput = getQuantityInput(checkbox)
    const quantity = quantityInput ? getValidTypedQuantity(checkbox) : getTotalAvailableArea(checkbox)
    const unit = checkbox.getAttribute(AVAILABLE_UNIT_ATTR)
    if (typeof quantity === 'number' && unit) {
      plannedActions.push({ actionCode: checkbox.value, quantity, unit })
    }
  }
  return plannedActions
}

/**
 * Applies one action's availableArea from the refresh response. A checked
 * action's hint/max still update from its own (self-competing) response,
 * but it's never disabled by it - only unchecked actions grey out.
 * @param {HTMLInputElement} checkbox
 * @param {{ availableArea?: { value: number, unit: string }, requiresMaxQuantity?: number }} action
 */
function applyAvailability(checkbox, action) {
  const { availableArea } = action
  if (availableArea) {
    checkbox.setAttribute(AVAILABLE_UNIT_ATTR, availableArea.unit)
  }

  const quantityInput = getQuantityInput(checkbox)
  // A quantity action needs whatever's validly typed (nothing typed = needs
  // nothing); a non-quantity action always needs its full original area.
  const needs = quantityInput ? (getValidTypedQuantity(checkbox) ?? 0) : getTotalAvailableArea(checkbox)
  const isUnavailable =
    !checkbox.checked && availableArea != null && (availableArea.value === 0 || availableArea.value < (needs ?? 0))
  checkbox.disabled = isUnavailable

  const item = /** @type {HTMLElement | null} */ (checkbox.closest('.govuk-checkboxes__item'))
  const message = item?.querySelector(`.${UNAVAILABLE_CLASS}`)
  if (isUnavailable && !message && item) {
    const p = document.createElement('p')
    p.className = `${UNAVAILABLE_CLASS} govuk-hint govuk-checkboxes__hint`
    p.textContent = UNAVAILABLE_MESSAGE
    item.appendChild(p)
  } else if (!isUnavailable) {
    message?.remove()
  }

  if (action.requiresMaxQuantity == null || !quantityInput || !availableArea) {
    return
  }
  quantityInput.disabled = isUnavailable
  quantityInput.max = String(availableArea.value)
  const hint = document.getElementById(`${quantityInput.id}-hint`)
  if (hint) {
    hint.textContent = availabilityHintText(availableArea.value, availableArea.unit)
  }
}

/**
 * @typedef {{ code: string, availableArea?: { value: number, unit: string }, requiresMaxQuantity?: number }} ActionAvailability
 */

/**
 * @param {string} parcelId
 * @param {Array<{ actionCode: string, quantity: number, unit: string }>} plannedActions
 * @returns {Promise<ActionAvailability[] | null>}
 */
async function postPlannedActions(parcelId, plannedActions) {
  const crumb = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="crumb"]'))?.value
  try {
    const response = await fetch(`/api/land-grants/actions/${encodeURIComponent(parcelId)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(crumb ? { 'X-CSRF-Token': crumb } : {}) },
      body: JSON.stringify({ plannedActions })
    })
    if (!response.ok) {
      return null
    }
    /** @type {{ actions: ActionAvailability[] }} */
    const { actions = [] } = await response.json()
    return actions
  } catch {
    return null
  }
}

/**
 * @param {HTMLElement} form
 * @param {string} parcelId
 * @returns {() => Promise<void>}
 */
function createAvailabilityRefresher(form, parcelId) {
  let requestId = 0

  return async function refreshAvailability() {
    const thisRequestId = ++requestId
    const plannedActions = buildPlannedActions(form)
    const actions = await postPlannedActions(parcelId, plannedActions)

    if (thisRequestId !== requestId) {
      // A newer refresh has already taken over - ignore this stale response.
      return
    }

    for (const checkbox of getCheckboxes(form)) {
      const action = actions?.find((a) => a.code === checkbox.value)
      if (action) {
        applyAvailability(checkbox, action)
      }
    }
  }
}

export function initSelectActionsPage(form) {
  if (!form) {
    return
  }
  const parcelId = new URLSearchParams(window.location.search).get('parcelId')
  if (!parcelId) {
    return
  }

  const refreshAvailability = createAvailabilityRefresher(form, parcelId)
  const debouncedRefresh = debounce(refreshAvailability, QUANTITY_DEBOUNCE_MS)

  form.addEventListener('change', (event) => {
    const target = /** @type {HTMLElement} */ (event.target)
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox' || target.name !== CHECKBOX_NAME) {
      return
    }
    const quantityInput = getQuantityInput(target)
    if (!target.checked) {
      // Clear any typed quantity on uncheck, so a stale value can't linger
      // and confuse a future read or the user re-checking the box.
      if (quantityInput) {
        quantityInput.value = ''
      }
    } else if (quantityInput && getValidTypedQuantity(target) == null) {
      // Nothing valid typed yet - checking the box alone doesn't claim
      // anything, so there's nothing new to ask the backend about.
      return
    }
    refreshAvailability()
  })

  form.addEventListener('input', (event) => {
    const target = /** @type {HTMLElement} */ (event.target)
    if (!(target instanceof HTMLInputElement) || !target.name.startsWith(QUANTITY_FIELD_PREFIX)) {
      return
    }
    const checkbox = form.querySelector(
      `input[name="${CHECKBOX_NAME}"][value="${target.name.slice(QUANTITY_FIELD_PREFIX.length)}"]`
    )
    if (!(checkbox instanceof HTMLInputElement)) {
      return
    }
    updateHintLive(checkbox)
    if (getValidTypedQuantity(checkbox) != null) {
      debouncedRefresh()
    }
  })

  // The page can render with actions already checked (a saved selection) -
  // their competing effect on other actions must show up immediately.
  if (buildPlannedActions(form).length > 0) {
    refreshAvailability()
  }
}

// This module is assuming that it renders one
// <form> - no marker attribute needed to find it.
initSelectActionsPage(document.querySelector('form'))
