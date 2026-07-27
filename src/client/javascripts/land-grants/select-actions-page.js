import { ACTION_QUANTITY_FIELD_PREFIX, getActionQuantityFieldName } from '../../../shared/action-quantity-field.js'
import { formatAreaUnit } from '../../../shared/format-area-unit.js'
import { isValidCompoundParcelId } from '../../../shared/format-parcel.js'

const CHECKBOX_NAME = 'landAction'
const UNAVAILABLE_MESSAGE = 'Not compatible with other selected actions.'
const UNAVAILABLE_CLASS = 'select-actions-unavailable-message'
const AVAILABLE_UNIT_ATTR = 'data-available-unit'
const TOTAL_AVAILABLE_AREA_ATTR = 'data-total-available-area'
const LIVE_AVAILABLE_AREA_ATTR = 'data-live-available-area'
const REFRESH_BANNER_MESSAGE = 'Updating available land for this action…'
const REFRESH_BANNER_CLASS = 'select-actions-refresh-banner'
const REFRESH_BANNER_HIDDEN_CLASS = 'select-actions-refresh-banner--hidden'

/**
 * @param {number} value
 * @param {string} unit
 */
const availabilityHintText = (value, unit) => `${value} ${formatAreaUnit(unit)} available`

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
 * Shows/hides a non-quantity checkbox's own "Updating..." banner. Unlike a
 * quantity action, there's no conditional panel to host a server-rendered
 * one, so it's lazily created inside the checkbox's own item on first use and
 * removed once loading ends - same lazy-DOM pattern as
 * toggleUnavailableMessage's "not compatible" message.
 * @param {HTMLInputElement} checkbox
 * @param {boolean} isLoading
 */
function toggleCheckboxRefreshBanner(checkbox, isLoading) {
  const item = /** @type {HTMLElement | null} */ (checkbox.closest('.govuk-checkboxes__item'))
  const existing = item?.querySelector(`.${REFRESH_BANNER_CLASS}`)
  if (!isLoading) {
    existing?.remove()
    return
  }
  if (!existing && item) {
    const div = document.createElement('div')
    div.className = REFRESH_BANNER_CLASS
    div.textContent = REFRESH_BANNER_MESSAGE
    item.appendChild(div)
  }
}

/**
 * Shows/hides the "Updating available land for this action..." banner for the
 * action whose blur (if it has a quantity input) or check/uncheck triggered
 * this refresh - only that one action's number is actually changing from the
 * user's point of view, so other actions' banners are left alone.
 * @param {HTMLInputElement} checkbox
 * @param {boolean} isLoading
 */
function toggleRefreshBanner(checkbox, isLoading) {
  const quantityInput = getQuantityInput(checkbox)
  if (!quantityInput) {
    toggleCheckboxRefreshBanner(checkbox, isLoading)
    return
  }
  const banner = document.getElementById(`${quantityInput.id}-refresh-banner`)
  banner?.classList.toggle(REFRESH_BANNER_HIDDEN_CLASS, !isLoading)
}

/**
 * Disables every OTHER action's checkbox (and quantity input, if any) while
 * one action's refresh is in flight, since its response could change any of
 * them - the one actually being touched (typed into or just checked/
 * unchecked) stays interactive throughout, since the user is mid-interaction
 * with it and disabling it under the pointer/keyboard would be jarring.
 * Only ever disables: the caller's own post-response applyAvailability pass
 * (run for every checkbox once the response lands) re-establishes each one's
 * correct disabled state from scratch, so there's nothing to undo here.
 * @param {HTMLElement} form
 * @param {HTMLInputElement} triggeringCheckbox
 */
function disableOtherActions(form, triggeringCheckbox) {
  for (const checkbox of getCheckboxes(form)) {
    if (checkbox === triggeringCheckbox) {
      continue
    }
    checkbox.disabled = true
    const quantityInput = getQuantityInput(checkbox)
    if (quantityInput) {
      quantityInput.disabled = true
    }
  }
}

/** @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getTotalAvailableArea(checkbox) {
  const value = Number(checkbox.getAttribute(TOTAL_AVAILABLE_AREA_ATTR))
  return Number.isFinite(value) ? value : undefined
}

/**
 * The most recently fetched availableArea for a non-quantity action, or its
 * original total if no fetch has happened yet. A non-quantity action has no
 * input of its own to reveal how much of its area other checked actions have
 * already used - only the server's own recompute (see applyAvailability)
 * knows that, so this MUST be sourced from the last response, never
 * re-derived from the static original total.
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getLiveAvailableArea(checkbox) {
  const raw = checkbox.getAttribute(LIVE_AVAILABLE_AREA_ATTR)
  if (raw == null) {
    return getTotalAvailableArea(checkbox)
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/** @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getValidTypedQuantity(checkbox) {
  const typed = Number(getQuantityInput(checkbox)?.value.trim())
  const total = getTotalAvailableArea(checkbox)
  return typed > 0 && (total == null || typed <= total) ? typed : undefined
}

/** @param {HTMLInputElement} checkbox */
function updateHintLive(checkbox) {
  const quantityInput = getQuantityInput(checkbox)
  const total = getTotalAvailableArea(checkbox)
  const unit = checkbox.getAttribute(AVAILABLE_UNIT_ATTR)
  const hint = quantityInput && document.getElementById(`${quantityInput.id}-hint`)
  if (!quantityInput || total == null || !unit || !hint) {
    return
  }
  const typed = Number(quantityInput.value.trim())
  // Round to 4dp to absorb float noise (e.g. 0.3271 - 0.2 !== 0.1271 in JS).
  const remaining = typed > 0 ? Math.max(0, Math.round((total - typed) * 10000) / 10000) : total
  hint.textContent = availabilityHintText(remaining, unit)
}

/**
 * A checked, quantity-required action with no currently-valid typed quantity
 * (empty, or invalid) isn't a real selection yet - unchecking and disabling
 * it (rather than leaving it checked-but-unconfirmed) stops it from silently
 * vanishing from state on submit while still looking selected on the page.
 * An action with a genuinely valid quantity is left alone; the user has
 * committed to it.
 * @param {HTMLElement} form
 * @returns {Set<HTMLInputElement>} Checkboxes just force-unchecked, so the
 *   availability response for this same refresh doesn't re-enable them.
 */
function uncheckUnconfirmedQuantityActions(form) {
  const forced = new Set()
  for (const checkbox of getCheckboxes(form)) {
    const quantityInput = getQuantityInput(checkbox)
    if (checkbox.checked && quantityInput && getValidTypedQuantity(checkbox) == null) {
      checkbox.checked = false
      markUnavailable(checkbox, quantityInput)
      forced.add(checkbox)
    }
  }
  return forced
}

/** @param {HTMLElement} form
 * @returns {Array<{ actionCode: string, quantity: number, unit: string }>}
 */
function buildPlannedActions(form) {
  const plannedActions = []
  for (const checkbox of getCheckboxes(form)) {
    if (!checkbox.checked) {
      continue
    }
    const quantityInput = getQuantityInput(checkbox)
    const quantity = quantityInput ? getValidTypedQuantity(checkbox) : getLiveAvailableArea(checkbox)
    const unit = checkbox.getAttribute(AVAILABLE_UNIT_ATTR)
    if (typeof quantity === 'number' && unit) {
      plannedActions.push({ actionCode: checkbox.value, quantity, unit })
    }
  }
  return plannedActions
}

/**
 * A checked action is never disabled by its own (self-competing) response. A
 * non-quantity action just needs some area left (> 0), not its full original
 * total - unlike a quantity-required action, it hasn't committed to a
 * specific amount, so a reduced-but-nonzero area doesn't make it unusable.
 * @param {HTMLInputElement} checkbox
 * @param {{ value: number, unit: string } | undefined} availableArea
 * @returns {boolean}
 */
function computeIsUnavailable(checkbox, availableArea) {
  if (checkbox.checked || availableArea == null) {
    return false
  }
  const quantityInput = getQuantityInput(checkbox)
  if (!quantityInput) {
    return availableArea.value === 0
  }
  const needs = getValidTypedQuantity(checkbox) ?? 0
  return availableArea.value === 0 || availableArea.value < needs
}

/** @param {HTMLInputElement} checkbox
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
 * Hides a checkbox's conditional reveal panel (its quantity input) - GOV.UK's
 * own JS only toggles this in response to a user click, so a panel left open
 * by an earlier check would otherwise sit there empty and disabled instead
 * of being hidden along with the checkbox. Only ever force-hides; never
 * force-shows, since that's the browser's own job on checked state and doing
 * it here would re-open a panel the user (or an uncheck) already closed.
 * @param {HTMLInputElement} checkbox
 */
function hideConditionalReveal(checkbox) {
  const conditionalId = checkbox.getAttribute('aria-controls')
  const reveal = conditionalId ? document.getElementById(conditionalId) : null
  reveal?.classList.add('govuk-checkboxes__conditional--hidden')
}

/**
 * Marks a checkbox as unavailable: disables it (and its quantity input, if
 * any), hides the quantity panel, and shows the "not compatible" message.
 * The single place all three visual aspects of "not a valid selection" stay
 * in sync, whether driven by an availability response or a client-side rule
 * like an unconfirmed quantity.
 * @param {HTMLInputElement} checkbox
 * @param {HTMLInputElement | null} [quantityInput]
 */
function markUnavailable(checkbox, quantityInput = getQuantityInput(checkbox)) {
  checkbox.disabled = true
  if (quantityInput) {
    quantityInput.disabled = true
  }
  hideConditionalReveal(checkbox)
  toggleUnavailableMessage(checkbox, true)
}

/**
 * Refreshes a quantity input's max/hint from the latest availableArea.
 * Availability (disabled state, panel, message) is handled separately by
 * the caller via markUnavailable / clearUnavailable.
 * @param {HTMLInputElement} checkbox
 * @param {{ availableArea?: { value: number, unit: string }, requiresMaxQuantity?: number }} action
 */
function syncQuantityInputBounds(checkbox, action) {
  const quantityInput = getQuantityInput(checkbox)
  if (action.requiresMaxQuantity == null || !quantityInput || !action.availableArea) {
    return
  }
  quantityInput.max = String(action.availableArea.value)
  const hint = document.getElementById(`${quantityInput.id}-hint`)
  if (hint) {
    hint.textContent = availabilityHintText(action.availableArea.value, action.availableArea.unit)
  }
}

/**
 * Marks a checkbox (and its quantity input, if any) as available: clears
 * disabled state and the "not compatible" message. The panel's own open/
 * closed state is left alone - only the browser (via a checked-state click)
 * ever opens it.
 * @param {HTMLInputElement} checkbox
 */
function clearUnavailable(checkbox) {
  checkbox.disabled = false
  const quantityInput = getQuantityInput(checkbox)
  if (quantityInput) {
    quantityInput.disabled = false
  }
  toggleUnavailableMessage(checkbox, false)
}

/** @param {HTMLInputElement} checkbox
 * @param {{ availableArea?: { value: number, unit: string }, requiresMaxQuantity?: number }} action
 */
function applyAvailability(checkbox, action) {
  const { availableArea } = action
  if (availableArea) {
    checkbox.setAttribute(AVAILABLE_UNIT_ATTR, availableArea.unit)
    checkbox.setAttribute(LIVE_AVAILABLE_AREA_ATTR, String(availableArea.value))
  }

  syncQuantityInputBounds(checkbox, action)

  if (computeIsUnavailable(checkbox, availableArea)) {
    markUnavailable(checkbox)
  } else {
    clearUnavailable(checkbox)
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
 * @returns {(triggeringCheckbox?: HTMLInputElement) => Promise<void>}
 */
function createAvailabilityRefresher(form, parcelId) {
  let requestId = 0

  // triggeringCheckbox: the action whose quantity input was just blurred, if
  // that's what triggered this refresh - its own conditional panel shows the
  // "updating" banner, since that's the one number the user is waiting on.
  // Omitted for a checkbox-triggered refresh, where no single action's
  // number is what the user is mid-edit on.
  return async function refreshAvailability(triggeringCheckbox) {
    const forcedUnchecked = uncheckUnconfirmedQuantityActions(form)
    requestId += 1
    const thisRequestId = requestId
    if (triggeringCheckbox) {
      toggleRefreshBanner(triggeringCheckbox, true)
      disableOtherActions(form, triggeringCheckbox)
    }
    const plannedActions = buildPlannedActions(form)
    const actions = await postPlannedActions(parcelId, plannedActions)

    if (thisRequestId !== requestId) {
      // A newer refresh has already taken over - ignore this stale response,
      // and leave the banner alone (the newer refresh owns it).
      return
    }
    if (triggeringCheckbox) {
      toggleRefreshBanner(triggeringCheckbox, false)
    }

    for (const checkbox of getCheckboxes(form)) {
      if (forcedUnchecked.has(checkbox)) {
        continue
      }
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

  // Grey out any already-checked (saved) selection that's now incompatible.
  if (buildPlannedActions(form).length > 0) {
    refreshAvailability()
  }

  // Recompute a pre-selected action's hint against its own saved quantity.
  for (const checkbox of getCheckboxes(form)) {
    if (getQuantityInput(checkbox)?.value.trim()) {
      updateHintLive(checkbox)
    }
  }

  form.addEventListener('change', (event) => {
    const target = /** @type {HTMLElement} */ (event.target)
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox' || target.name !== CHECKBOX_NAME) {
      return
    }
    const quantityInput = getQuantityInput(target)
    if (!target.checked && quantityInput) {
      // Clear a stale typed quantity on uncheck.
      quantityInput.value = ''
    }
    if (target.checked && quantityInput && getValidTypedQuantity(target) == null) {
      return
    }
    refreshAvailability(target)
  })

  /**
   * @param {EventTarget | null} target
   * @returns {HTMLInputElement | null}
   */
  const getCheckboxForQuantityTarget = (target) => {
    if (!(target instanceof HTMLInputElement) || !target.name.startsWith(ACTION_QUANTITY_FIELD_PREFIX)) {
      return null
    }
    const checkbox = form.querySelector(
      `input[name="${CHECKBOX_NAME}"][value="${target.name.slice(ACTION_QUANTITY_FIELD_PREFIX.length)}"]`
    )
    return checkbox instanceof HTMLInputElement ? checkbox : null
  }

  form.addEventListener('input', (event) => {
    const checkbox = getCheckboxForQuantityTarget(event.target)
    if (checkbox) {
      updateHintLive(checkbox)
    }
  })

  // Refresh once the user leaves the quantity field, rather than on every
  // keystroke - avoids firing a request for a value that's still being typed.
  form.addEventListener(
    'blur',
    (event) => {
      const checkbox = getCheckboxForQuantityTarget(event.target)
      if (checkbox && getValidTypedQuantity(checkbox) != null) {
        refreshAvailability(checkbox)
      }
    },
    true
  )
}

initSelectActionsPage(document.querySelector('form'))
