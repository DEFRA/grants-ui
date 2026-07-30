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

/**
 * A quantity action's real, user-facing input - a non-quantity action shares
 * the same field name for its hidden chosen-area field instead (type="hidden"), so this returns null for it.
 * @param {HTMLInputElement} checkbox
 * @returns {HTMLInputElement | null}
 */
function getQuantityInput(checkbox) {
  const field = /** @type {HTMLInputElement | null} */ (
    document.getElementById(getActionQuantityFieldName(checkbox.value))
  )
  return field?.type === 'hidden' ? null : field
}

/**
 * A non-quantity action's hidden field carrying its chosen area - shares its field name with getQuantityInput.
 * @param {HTMLInputElement} checkbox
 * @returns {HTMLInputElement | null}
 */
function getChosenAreaField(checkbox) {
  const field = /** @type {HTMLInputElement | null} */ (
    document.getElementById(getActionQuantityFieldName(checkbox.value))
  )
  return field?.type === 'hidden' ? field : null
}

/**
 * A checked action redisplayed from a rejected submission (see
 * data-error-on-load) must keep its own checked state, typed value and
 * chosen area untouched by the live refresh, until the user directly
 * interacts with it - clearErrorOnLoad below is what ends this.
 * @param {HTMLInputElement} checkbox
 * @returns {boolean}
 */
function isProtectedFromRefresh(checkbox) {
  return checkbox.checked && Boolean(checkbox.dataset.errorOnLoad)
}

/**
 * A direct interaction with this checkbox (or its own quantity input) means
 * its rejected value is no longer what's protected - a fresh claim, however
 * it turns out, must be trusted and reflected normally from here on.
 * @param {HTMLInputElement} checkbox
 */
function clearErrorOnLoad(checkbox) {
  delete checkbox.dataset.errorOnLoad
}

/**
 * A non-quantity checkbox has no conditional panel, so its banner is lazily created/removed here instead.
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
 * Shows/hides the "Updating..." banner for the triggering action only.
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
 * Disables every OTHER checkbox/quantity input while one action's refresh is in flight; applyAvailability restores them after.
 * @param {HTMLElement} form
 * @param {HTMLInputElement} triggeringCheckbox
 */
function disableOtherActions(form, triggeringCheckbox) {
  for (const checkbox of getCheckboxes(form)) {
    if (checkbox === triggeringCheckbox || isProtectedFromRefresh(checkbox)) {
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
 * Headroom left for OTHER actions, most recently reported by the API.
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
 * What a checked action currently holds - its own hidden field (non-quantity)
 * or data-total-chosen-area (quantity action, which has no hidden field of
 * its own). A non-quantity action can never genuinely claim exactly 0 (that's
 * the same as not being checked), so a 0 hidden-field value - the server's
 * default before any claim is established - reads as "not yet established".
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getChosenArea(checkbox) {
  if (getQuantityInput(checkbox)) {
    const raw = checkbox.getAttribute(TOTAL_CHOSEN_AREA_ATTR)
    const chosenArea = raw == null ? Number.NaN : Number(raw)
    return Number.isFinite(chosenArea) ? chosenArea : undefined
  }
  const value = Number(getChosenAreaField(checkbox)?.value)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Records a non-quantity action's chosen area in its hidden field, for both live client use and form submission.
 * @param {HTMLInputElement} checkbox
 * @param {number} chosenArea
 */
function setChosenArea(checkbox, chosenArea) {
  const field = getChosenAreaField(checkbox)
  if (field) {
    field.value = String(chosenArea)
  }
}

/**
 * @param {HTMLInputElement} checkbox
 */
function clearChosenArea(checkbox) {
  if (getQuantityInput(checkbox)) {
    checkbox.removeAttribute(TOTAL_CHOSEN_AREA_ATTR)
    return
  }
  const field = getChosenAreaField(checkbox)
  if (field) {
    field.value = '0'
  }
}

/**
 * A typed quantity is valid up to the action's own static total - not the
 * live/competed max, which can read lower than a value that's still valid.
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getValidTypedQuantity(checkbox) {
  const quantityInput = getQuantityInput(checkbox)
  const typed = Number(quantityInput?.value.trim())
  const max = getTotalAvailableArea(checkbox)
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
 * A checked quantity action with no valid typed quantity reverts to its last-confirmed value, or is unchecked if it has none.
 * @param {HTMLElement} form
 * @returns {Set<HTMLInputElement>} Checkboxes just force-unchecked, so the
 *   availability response for this same refresh doesn't re-enable them.
 */
function uncheckUnconfirmedQuantityActions(form) {
  const forced = new Set()
  for (const checkbox of getCheckboxes(form)) {
    const quantityInput = getQuantityInput(checkbox)
    const isUnconfirmed =
      !isProtectedFromRefresh(checkbox) && checkbox.checked && quantityInput && getValidTypedQuantity(checkbox) == null
    if (!isUnconfirmed) {
      continue
    }
    const confirmed = getChosenArea(checkbox)
    if (confirmed != null) {
      quantityInput.value = String(confirmed)
    } else {
      checkbox.checked = false
      markUnavailable(checkbox, quantityInput)
      forced.add(checkbox)
    }
  }
  return forced
}

/**
 * What a checked action is claiming for THIS request - typed/last-confirmed value for a quantity action, held/live area otherwise.
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
 * Force-hides a checkbox's conditional reveal panel; never force-shows, that stays the browser's job.
 * @param {HTMLInputElement} checkbox
 */
function hideConditionalReveal(checkbox) {
  const conditionalId = checkbox.getAttribute('aria-controls')
  const reveal = conditionalId ? document.getElementById(conditionalId) : null
  reveal?.classList.add('govuk-checkboxes__conditional--hidden')
}

/**
 * Marks a checkbox as unavailable: unchecks, disables, hides the panel, shows the "not compatible" message, and wipes its chosen area.
 * @param {HTMLInputElement} checkbox
 * @param {HTMLInputElement | null} [quantityInput]
 */
function markUnavailable(checkbox, quantityInput = getQuantityInput(checkbox)) {
  checkbox.checked = false
  checkbox.disabled = true
  clearChosenArea(checkbox)
  if (quantityInput) {
    quantityInput.value = ''
    quantityInput.disabled = true
  }
  hideConditionalReveal(checkbox)
  toggleUnavailableMessage(checkbox, true)
}

/**
 * Refreshes a quantity input's max/hint from the latest availableArea, as reported by the API.
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
 * Marks a checkbox as available: clears disabled state and the "not compatible" message.
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
 * A non-quantity action's chosen area: sentQuantity plus any extra headroom the response reports, but only when allowGrowth is true
 * (only the checkbox that triggered this refresh, or one claiming for the first time, may grow from unverified surplus).
 * @param {number} responseValue
 * @param {number} sentQuantity
 * @param {boolean} allowGrowth
 * @returns {number}
 */
function resolveChosenArea(responseValue, sentQuantity, allowGrowth) {
  return allowGrowth ? sentQuantity + responseValue : sentQuantity
}

/**
 * Not selected: unavailable when there's nothing (or not enough, for a typed amount) left to claim.
 * @param {HTMLInputElement} checkbox
 * @param {HTMLInputElement | null} quantityInput
 * @param {{ value: number, unit: string }} [availableArea]
 */
function applyUncheckedAvailability(checkbox, quantityInput, availableArea) {
  const isUnavailable =
    availableArea != null && quantityInput
      ? availableArea.value === 0 || availableArea.value < (getValidTypedQuantity(checkbox) ?? 0)
      : availableArea?.value === 0
  if (isUnavailable) {
    markUnavailable(checkbox)
  } else {
    clearUnavailable(checkbox)
  }
}

/**
 * Checked quantity action: records sentQuantity as its last-confirmed value (see getChosenArea); never disabled by its own response.
 * @param {HTMLInputElement} checkbox
 * @param {number | undefined} sentQuantity
 */
function applyCheckedQuantityAvailability(checkbox, sentQuantity) {
  if (typeof sentQuantity === 'number') {
    checkbox.setAttribute(TOTAL_CHOSEN_AREA_ATTR, String(sentQuantity))
  }
  clearUnavailable(checkbox)
}

/**
 * Checked non-quantity action: grows its chosen area from response surplus when allowed, disables it if nothing's left claimed.
 * @param {HTMLInputElement} checkbox
 * @param {number} availableAreaValue
 * @param {number} sentQuantity
 * @param {boolean} allowGrowth
 */
function applyCheckedNonQuantityAvailability(checkbox, availableAreaValue, sentQuantity, allowGrowth) {
  const chosenArea = resolveChosenArea(availableAreaValue, sentQuantity, allowGrowth)
  setChosenArea(checkbox, chosenArea)
  if (chosenArea === 0) {
    markUnavailable(checkbox)
  } else {
    clearUnavailable(checkbox)
  }
}

/**
 * Applies one action's response: headroom attribute, quantity bounds, and - if checked - chosen area and disabled state.
 * A protected checkbox (see isProtectedFromRefresh) keeps its own checked
 * state, typed value and chosen area untouched - it's still allowed to be
 * re-enabled/disabled by fresh availability, since that reflects what OTHER
 * actions are doing, not a correction to its own rejected value.
 * @param {HTMLInputElement} checkbox
 * @param {{ availableArea?: { value: number, unit: string }, requiresMaxQuantity?: number }} action
 * @param {number | undefined} sentQuantity - What we claimed for this action, if checked and included.
 * @param {boolean} allowGrowth - Whether this checkbox may grow from response surplus (see resolveChosenArea).
 * @param {boolean} isProtected
 */
function applyAvailability(checkbox, action, sentQuantity, allowGrowth, isProtected) {
  const { availableArea } = action
  const quantityInput = getQuantityInput(checkbox)
  if (availableArea) {
    checkbox.setAttribute(AVAILABLE_UNIT_ATTR, availableArea.unit)
    checkbox.setAttribute(LIVE_AVAILABLE_AREA_ATTR, String(availableArea.value))
  }

  syncQuantityInputBounds(checkbox, action)

  if (!checkbox.checked) {
    applyUncheckedAvailability(checkbox, quantityInput, availableArea)
    return
  }
  if (availableArea == null) {
    return
  }
  if (isProtected) {
    clearUnavailable(checkbox)
    return
  }
  if (quantityInput) {
    applyCheckedQuantityAvailability(checkbox, sentQuantity)
    return
  }
  applyCheckedNonQuantityAvailability(checkbox, availableArea.value, /** @type {number} */ (sentQuantity), allowGrowth)
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
 * Request failed (network error or e.g. 422) - undo disableOtherActions rather than leaving every action stuck disabled.
 * @param {HTMLElement} form
 * @param {Set<HTMLInputElement>} forcedUnchecked
 */
function recoverFromFailedRefresh(form, forcedUnchecked) {
  for (const checkbox of getCheckboxes(form)) {
    if (!forcedUnchecked.has(checkbox) && !isProtectedFromRefresh(checkbox)) {
      clearUnavailable(checkbox)
    }
  }
}

/**
 * @param {HTMLElement} form
 * @param {ActionAvailability[]} actions
 * @param {Array<{ actionCode: string, quantity: number, unit: string }>} plannedActions
 * @param {Set<HTMLInputElement>} forcedUnchecked
 * @param {HTMLInputElement} [triggeringCheckbox]
 */
function applyRefreshResponse(form, actions, plannedActions, forcedUnchecked, triggeringCheckbox) {
  const sentQuantityByCode = new Map(plannedActions.map((p) => [p.actionCode, p.quantity]))
  for (const checkbox of getCheckboxes(form)) {
    if (forcedUnchecked.has(checkbox)) {
      continue
    }
    const action = actions.find((a) => a.code === checkbox.value)
    if (action) {
      // A first-ever claim always "grows" from nothing - allowed regardless of trigger.
      const allowGrowth = checkbox === triggeringCheckbox || getChosenArea(checkbox) == null
      applyAvailability(
        checkbox,
        action,
        sentQuantityByCode.get(checkbox.value),
        allowGrowth,
        isProtectedFromRefresh(checkbox)
      )
    }
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
      recoverFromFailedRefresh(form, forcedUnchecked)
      return
    }

    applyRefreshResponse(form, actions, plannedActions, forcedUnchecked, triggeringCheckbox)
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

  // Grey out incompatible selections and hydrate chosen areas (see
  // isProtectedFromRefresh for checked/errored exceptions, cleared per
  // checkbox by clearErrorOnLoad below on that checkbox's own next interaction).
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
    clearErrorOnLoad(target)
    const quantityInput = getQuantityInput(target)
    if (!target.checked) {
      if (quantityInput) {
        // Clear a stale typed quantity on uncheck.
        quantityInput.value = ''
      }
      // A future re-check must claim afresh, not resend an old claim.
      clearChosenArea(target)
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

  // Remembers each quantity input's value as of its last focus, so blur can
  // tell an actual edit apart from focus merely passing through (e.g. a click
  // landing on a DIFFERENT checkbox first blurs this field with no edit at all).
  let valueOnFocus = ''
  form.addEventListener(
    'focus',
    (event) => {
      if (getCheckboxForQuantityTarget(event.target)) {
        valueOnFocus = /** @type {HTMLInputElement} */ (event.target).value
      }
    },
    true
  )

  // Refresh once the user leaves the field, not on every keystroke.
  form.addEventListener(
    'blur',
    (event) => {
      const checkbox = getCheckboxForQuantityTarget(event.target)
      if (!checkbox) {
        return
      }
      if (/** @type {HTMLInputElement} */ (event.target).value !== valueOnFocus) {
        clearErrorOnLoad(checkbox)
      }
      if (getValidTypedQuantity(checkbox) != null) {
        refreshAvailability(checkbox)
      }
    },
    true
  )
}

initSelectActionsPage(document.querySelector('form'))
