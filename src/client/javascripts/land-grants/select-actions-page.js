// Live action-availability refresh for the select-actions page. As the user
// checks/unchecks actions or edits a quantity, sends the in-progress
// selection to the server, then greys out any other action no longer
// available. A selected action is never disabled by its own response.
import { ACTION_QUANTITY_FIELD_PREFIX, getActionQuantityFieldName } from '../../../shared/action-quantity-field.js'
import { formatAreaUnit } from '../../../shared/format-area-unit.js'
import { isValidCompoundParcelId } from '../../../shared/format-parcel.js'

const CHECKBOX_NAME = 'landAction'
const QUANTITY_DEBOUNCE_MS = 500
const UNAVAILABLE_MESSAGE = 'Not compatible with other selected actions.'
const UNAVAILABLE_CLASS = 'select-actions-unavailable-message'
const AVAILABLE_UNIT_ATTR = 'data-available-unit'
const TOTAL_AVAILABLE_AREA_ATTR = 'data-total-available-area'

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
  return /** @type {HTMLInputElement | null} */ (document.getElementById(getActionQuantityFieldName(checkbox.value)))
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
 * Whether a checkbox should grey out given its refreshed availableArea. A
 * checked action is never marked unavailable by its own (self-competing)
 * response - only unchecked actions grey out.
 * @param {HTMLInputElement} checkbox
 * @param {{ value: number, unit: string } | undefined} availableArea
 * @returns {boolean}
 */
function computeIsUnavailable(checkbox, availableArea) {
  if (checkbox.checked || availableArea == null) {
    return false
  }
  const quantityInput = getQuantityInput(checkbox)
  // A quantity action needs whatever's validly typed (nothing typed = needs
  // nothing); a non-quantity action always needs its full original area.
  const needs = (quantityInput ? getValidTypedQuantity(checkbox) : getTotalAvailableArea(checkbox)) ?? 0
  return availableArea.value === 0 || availableArea.value < needs
}

/**
 * Shows/hides the "not compatible" message alongside a checkbox.
 * @param {HTMLInputElement} checkbox
 * @param {boolean} isUnavailable
 */
function toggleUnavailableMessage(checkbox, isUnavailable) {
  const item = /** @type {HTMLElement | null} */ (checkbox.closest('.govuk-checkboxes__item'))
  const message = item?.querySelector(`.${UNAVAILABLE_CLASS}`)
  if (!isUnavailable) {
    message?.remove()
    return
  }
  if (!message && item) {
    const p = document.createElement('p')
    p.className = `${UNAVAILABLE_CLASS} govuk-hint govuk-checkboxes__hint`
    p.textContent = UNAVAILABLE_MESSAGE
    item.appendChild(p)
  }
}

/**
 * Syncs a quantity-required action's own input (disabled state, max, hint)
 * to its refreshed availableArea.
 * @param {HTMLInputElement} checkbox
 * @param {{ availableArea?: { value: number, unit: string }, requiresMaxQuantity?: number }} action
 * @param {boolean} isUnavailable
 */
function syncQuantityInput(checkbox, action, isUnavailable) {
  const quantityInput = getQuantityInput(checkbox)
  if (action.requiresMaxQuantity == null || !quantityInput || !action.availableArea) {
    return
  }
  quantityInput.disabled = isUnavailable
  quantityInput.max = String(action.availableArea.value)
  const hint = document.getElementById(`${quantityInput.id}-hint`)
  if (hint) {
    hint.textContent = availabilityHintText(action.availableArea.value, action.availableArea.unit)
  }
}

/**
 * Applies one action's availableArea from the refresh response.
 * @param {HTMLInputElement} checkbox
 * @param {{ availableArea?: { value: number, unit: string }, requiresMaxQuantity?: number }} action
 */
function applyAvailability(checkbox, action) {
  const { availableArea } = action
  if (availableArea) {
    checkbox.setAttribute(AVAILABLE_UNIT_ATTR, availableArea.unit)
  }

  const isUnavailable = computeIsUnavailable(checkbox, availableArea)
  checkbox.disabled = isUnavailable

  toggleUnavailableMessage(checkbox, isUnavailable)
  syncQuantityInput(checkbox, action, isUnavailable)
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
    requestId += 1
    const thisRequestId = requestId
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

/** @param {HTMLElement | null} form */
export function initSelectActionsPage(form) {
  if (!form) {
    return
  }
  const parcelId = new URLSearchParams(window.location.search).get('parcelId')
  if (!parcelId || !isValidCompoundParcelId(parcelId)) {
    return
  }

  const refreshAvailability = createAvailabilityRefresher(form, parcelId)
  const debouncedRefresh = debounce(refreshAvailability, QUANTITY_DEBOUNCE_MS)

  // A saved selection from a previous visit is already checked on render -
  // run one refresh immediately so any now-incompatible action greys out
  // without waiting for the user to touch anything.
  if (buildPlannedActions(form).length > 0) {
    refreshAvailability()
  }

  form.addEventListener('change', (event) => {
    const target = /** @type {HTMLElement} */ (event.target)
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox' || target.name !== CHECKBOX_NAME) {
      return
    }
    const quantityInput = getQuantityInput(target)
    if (!target.checked && quantityInput) {
      // Clear any typed quantity on uncheck, so a stale value can't linger
      // and confuse a future read or the user re-checking the box.
      quantityInput.value = ''
    }
    // Nothing valid typed yet - checking the box alone doesn't claim
    // anything, so there's nothing new to ask the backend about.
    if (target.checked && quantityInput && getValidTypedQuantity(target) == null) {
      return
    }
    refreshAvailability()
  })

  form.addEventListener('input', (event) => {
    const target = /** @type {HTMLElement} */ (event.target)
    if (!(target instanceof HTMLInputElement) || !target.name.startsWith(ACTION_QUANTITY_FIELD_PREFIX)) {
      return
    }
    const checkbox = form.querySelector(
      `input[name="${CHECKBOX_NAME}"][value="${target.name.slice(ACTION_QUANTITY_FIELD_PREFIX.length)}"]`
    )
    if (!(checkbox instanceof HTMLInputElement)) {
      return
    }
    updateHintLive(checkbox)
    if (getValidTypedQuantity(checkbox) != null) {
      debouncedRefresh()
    }
  })
}

// This module is only bundled on select-actions.html, which renders one
// <form> - no marker attribute needed to find it.
initSelectActionsPage(document.querySelector('form'))
