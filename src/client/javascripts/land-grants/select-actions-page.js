import { ACTION_QUANTITY_FIELD_PREFIX, getActionQuantityFieldName } from '../../../shared/action-quantity-field.js'
import { formatAreaUnit } from '../../../shared/format-area-unit.js'
import { isValidCompoundParcelId } from '../../../shared/format-parcel.js'

const CHECKBOX_NAME = 'landAction'
const UNAVAILABLE_MESSAGE = 'Not compatible with other selected actions.'
const UNAVAILABLE_CLASS = 'select-actions-unavailable-message'
const AVAILABLE_UNIT_ATTR = 'data-available-unit'
const TOTAL_AVAILABLE_AREA_ATTR = 'data-total-available-area'
const LIVE_AVAILABLE_AREA_ATTR = 'data-live-available-area'
const TOTAL_CHOSEN_AREA_ATTR = 'data-total-chosen-area'
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
 * A checked action the server has just flagged with a validation error
 * (govuk-input--error, from a failed submit) must keep showing that
 * feedback - the live refresh must never disable/uncheck/reset it or its
 * quantity input, or the user loses both their input and the error message
 * they're meant to be correcting.
 * @param {HTMLInputElement} checkbox
 * @returns {boolean}
 */
function hasQuantityError(checkbox) {
  return Boolean(getQuantityInput(checkbox)?.classList.contains('govuk-input--error'))
}

/**
 * A non-quantity checkbox has no conditional panel to host a server-rendered
 * banner, so it's lazily created/removed here instead.
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
 * Shows/hides the "Updating..." banner for the action that triggered this
 * refresh - other actions' banners are left alone.
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
 * Disables every OTHER checkbox/quantity input while one action's refresh is
 * in flight, since the response could change any of them. Only ever
 * disables - the post-response applyAvailability pass re-establishes each
 * one's correct state once the response lands.
 * @param {HTMLElement} form
 * @param {HTMLInputElement} triggeringCheckbox
 */
function disableOtherActions(form, triggeringCheckbox) {
  for (const checkbox of getCheckboxes(form)) {
    if (checkbox === triggeringCheckbox || hasQuantityError(checkbox)) {
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
 * Headroom left for OTHER actions, most recently reported by the API -
 * updated for every action (checked or not) on every response.
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

/**
 * What a checked action currently holds - set once it's successfully
 * claimed something, then only ever grown (see resolveGrownChosenArea) or
 * wiped by directly unchecking the action. For a non-quantity action, that's
 * its running claim; for a quantity action, it's the last quantity actually
 * confirmed (sent and accepted) - distinct from whatever's currently typed,
 * so an in-progress, unconfirmed edit (e.g. typing a new value that turns
 * out too high, then checking a different action before blurring) can fall
 * back to what was last known-good, rather than losing the selection.
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getChosenArea(checkbox) {
  const raw = checkbox.getAttribute(TOTAL_CHOSEN_AREA_ATTR)
  if (raw == null) {
    return undefined
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/**
 * A typed quantity is valid against the input's own max attribute - kept
 * accurate by syncQuantityInputBounds from the last confirmed server
 * response for this action (falling back to its static total before any
 * response has landed). Using the live max, not a separately-computed one,
 * means a value already known to conflict with the server's last answer
 * never triggers another doomed request.
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getValidTypedQuantity(checkbox) {
  const quantityInput = getQuantityInput(checkbox)
  const typed = Number(quantityInput?.value.trim())
  const max = quantityInput?.max ? Number(quantityInput.max) : getTotalAvailableArea(checkbox)
  return typed > 0 && (max == null || typed <= max) ? typed : undefined
}

/**
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
  // Round to 4dp to absorb float noise (e.g. 0.3271 - 0.2 !== 0.1271 in JS).
  const remaining = typed > 0 ? Math.max(0, Math.round((total - typed) * 10000) / 10000) : total
  hint.textContent = availabilityHintText(remaining, unit)
}

/**
 * A checked, quantity-required action with no valid typed quantity isn't a
 * real selection yet. If it has a last-confirmed quantity (see
 * applyAvailability), this is just an in-progress, unconfirmed edit - revert
 * the field to that confirmed value rather than losing the selection.
 * Otherwise there's nothing to fall back to, so uncheck and disable it
 * rather than leave it looking selected while silently absent from
 * submitted state.
 * @param {HTMLElement} form
 * @returns {Set<HTMLInputElement>} Checkboxes just force-unchecked, so the
 *   availability response for this same refresh doesn't re-enable them.
 */
function uncheckUnconfirmedQuantityActions(form) {
  const forced = new Set()
  for (const checkbox of getCheckboxes(form)) {
    if (hasQuantityError(checkbox)) {
      continue
    }
    const quantityInput = getQuantityInput(checkbox)
    if (checkbox.checked && quantityInput && getValidTypedQuantity(checkbox) == null) {
      const confirmed = getChosenArea(checkbox)
      if (confirmed != null) {
        quantityInput.value = String(confirmed)
        continue
      }
      checkbox.checked = false
      markUnavailable(checkbox, quantityInput)
      forced.add(checkbox)
    }
  }
  return forced
}

/**
 * What a checked action is claiming for THIS request - a quantity action
 * sends its own typed value, falling back to its last confirmed quantity if
 * what's currently typed is invalid/unconfirmed (uncheckUnconfirmedQuantityActions
 * already reverted the field to that same value, but a fetch triggered by a
 * DIFFERENT checkbox in the same tick can still race ahead of that); a
 * non-quantity action sends what it already holds (getChosenArea), or its
 * latest known headroom if it's being checked for the first time and holds
 * nothing yet.
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getClaimForRequest(checkbox) {
  const quantityInput = getQuantityInput(checkbox)
  if (quantityInput) {
    return getValidTypedQuantity(checkbox) ?? getChosenArea(checkbox)
  }
  return getChosenArea(checkbox) ?? getLiveAvailableArea(checkbox)
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
    const quantity = getClaimForRequest(checkbox)
    const unit = checkbox.getAttribute(AVAILABLE_UNIT_ATTR)
    if (typeof quantity === 'number' && unit) {
      plannedActions.push({ actionCode: checkbox.value, quantity, unit })
    }
  }
  return plannedActions
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
 * Force-hides a checkbox's conditional reveal panel - GOV.UK's own JS only
 * toggles this on user click. Never force-shows; that stays the browser's job.
 * @param {HTMLInputElement} checkbox
 */
function hideConditionalReveal(checkbox) {
  const conditionalId = checkbox.getAttribute('aria-controls')
  const reveal = conditionalId ? document.getElementById(conditionalId) : null
  reveal?.classList.add('govuk-checkboxes__conditional--hidden')
}

/**
 * Marks a checkbox as unavailable: unchecks it (a selection that's no longer
 * possible must not stay looking selected), disables it and its quantity
 * input, hides the panel, and shows the "not compatible" message. Also wipes
 * its chosen area, so a future re-check claims afresh rather than resending
 * a stale amount.
 * @param {HTMLInputElement} checkbox
 * @param {HTMLInputElement | null} [quantityInput]
 */
function markUnavailable(checkbox, quantityInput = getQuantityInput(checkbox)) {
  checkbox.checked = false
  checkbox.disabled = true
  checkbox.removeAttribute(TOTAL_CHOSEN_AREA_ATTR)
  if (quantityInput) {
    quantityInput.value = ''
    quantityInput.disabled = true
  }
  hideConditionalReveal(checkbox)
  toggleUnavailableMessage(checkbox, true)
}

/**
 * Refreshes a quantity input's max/hint from the latest availableArea.
 * Availability (disabled state, panel, message) is handled separately by
 * the caller via markUnavailable / clearUnavailable. The API reports
 * availableArea as headroom BEYOND this action's own claim (see
 * resolveChosenArea for the same contract on non-quantity actions), so for
 * a checked action with a typed quantity, the displayed max/hint is what's
 * typed PLUS that extra headroom - not the raw response value alone, which
 * would misleadingly omit what's already held.
 * @param {HTMLInputElement} checkbox
 * @param {{ availableArea?: { value: number, unit: string }, requiresMaxQuantity?: number }} action
 */
function syncQuantityInputBounds(checkbox, action) {
  const quantityInput = getQuantityInput(checkbox)
  if (action.requiresMaxQuantity == null || !quantityInput || !action.availableArea) {
    return
  }
  const typed = checkbox.checked ? Number(quantityInput.value.trim()) : 0
  const displayValue = typed > 0 ? typed + action.availableArea.value : action.availableArea.value
  quantityInput.max = String(displayValue)
  const hint = document.getElementById(`${quantityInput.id}-hint`)
  if (hint) {
    hint.textContent = availabilityHintText(displayValue, action.availableArea.unit)
  }
}

/**
 * Marks a checkbox as available: clears disabled state and the "not
 * compatible" message. Leaves the panel's open/closed state alone.
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

/**
 * A non-quantity action's chosen area: sentQuantity (what it already
 * claimed) plus any EXTRA headroom this response reports beyond that claim
 * (responseValue - the API reports availableArea as headroom BEYOND an
 * action's own claim, not a repeat of its full holding, so a 0 response
 * means no extra - not a loss of what's already held), but ONLY when
 * allowGrowth is true. A single response can report surplus for several
 * checked actions at once (e.g. multiple actions freed up by the same
 * uncheck), but that combined growth was never itself verified against the
 * API - only the checkbox that actually triggered this refresh (or one
 * claiming for the first time) may grow; every other already-established
 * action keeps exactly what it already held.
 * @param {number} responseValue
 * @param {number} sentQuantity
 * @param {boolean} allowGrowth
 * @returns {number}
 */
function resolveChosenArea(responseValue, sentQuantity, allowGrowth) {
  return allowGrowth ? sentQuantity + responseValue : sentQuantity
}

/**
 * Applies one action's response: refreshes its shared headroom attribute,
 * its quantity input bounds, and - if checked - its chosen area and
 * disabled state.
 * @param {HTMLInputElement} checkbox
 * @param {{ availableArea?: { value: number, unit: string }, requiresMaxQuantity?: number }} action
 * @param {number | undefined} sentQuantity - What we claimed for this action
 *   in the request this response answers, if it was checked and included.
 * @param {boolean} allowGrowth - Whether this checkbox may grow its chosen
 *   area from response surplus (see resolveChosenArea).
 */
function applyAvailability(checkbox, action, sentQuantity, allowGrowth) {
  const { availableArea } = action
  if (availableArea) {
    checkbox.setAttribute(AVAILABLE_UNIT_ATTR, availableArea.unit)
    checkbox.setAttribute(LIVE_AVAILABLE_AREA_ATTR, String(availableArea.value))
  }

  syncQuantityInputBounds(checkbox, action)

  if (!checkbox.checked) {
    // Not selected: unavailable when there's genuinely nothing (or not
    // enough, for a quantity action's typed amount) left to claim.
    const quantityInput = getQuantityInput(checkbox)
    const isUnavailable = availableArea != null && quantityInput
      ? availableArea.value === 0 || availableArea.value < (getValidTypedQuantity(checkbox) ?? 0)
      : availableArea?.value === 0
    if (isUnavailable) {
      markUnavailable(checkbox)
    } else {
      clearUnavailable(checkbox)
    }
    return
  }

  if (availableArea == null) {
    return
  }

  const quantityInput = getQuantityInput(checkbox)
  if (quantityInput) {
    // Record what was actually confirmed for this quantity action, so a
    // later invalid/unconfirmed edit can fall back to it instead of losing
    // the selection - its own self-competing 0 response never disables it
    // (it has its own confirmed claim).
    if (typeof sentQuantity === 'number') {
      checkbox.setAttribute(TOTAL_CHOSEN_AREA_ATTR, String(sentQuantity))
    }
    clearUnavailable(checkbox)
    return
  }

  const chosenArea = resolveChosenArea(availableArea.value, /** @type {number} */ (sentQuantity), allowGrowth)
  checkbox.setAttribute(TOTAL_CHOSEN_AREA_ATTR, String(chosenArea))

  if (chosenArea === 0) {
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

    if (!actions) {
      // The request failed (network error, or the backend rejected this
      // exact combination as invalid, e.g. 422) - we have no new
      // information, so undo disableOtherActions rather than leaving
      // every other action stuck disabled with no way to recover.
      for (const checkbox of getCheckboxes(form)) {
        if (!forcedUnchecked.has(checkbox) && !hasQuantityError(checkbox)) {
          clearUnavailable(checkbox)
        }
      }
      return
    }

    const sentQuantityByCode = new Map(plannedActions.map((p) => [p.actionCode, p.quantity]))
    for (const checkbox of getCheckboxes(form)) {
      if (forcedUnchecked.has(checkbox) || hasQuantityError(checkbox)) {
        continue
      }
      const action = actions.find((a) => a.code === checkbox.value)
      if (action) {
        // A first-ever claim (no chosen area yet) always "grows" from
        // nothing to sentQuantity - that's establishing it, not surplus
        // beyond an existing one, so it's allowed regardless of trigger.
        const allowGrowth = checkbox === triggeringCheckbox || getChosenArea(checkbox) == null
        applyAvailability(checkbox, action, sentQuantityByCode.get(checkbox.value), allowGrowth)
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

  // Grey out any already-checked (saved) selection that's now incompatible,
  // and hydrate every checked action's chosen area from the saved state.
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
    if (!target.checked) {
      if (quantityInput) {
        // Clear a stale typed quantity on uncheck.
        quantityInput.value = ''
      }
      // A future re-check must claim afresh, not resend an old claim.
      target.removeAttribute(TOTAL_CHOSEN_AREA_ATTR)
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
