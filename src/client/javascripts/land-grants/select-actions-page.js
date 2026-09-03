import { ACTION_QUANTITY_FIELD_PREFIX, getActionQuantityFieldName } from '../../../shared/action-quantity-field.js'
import {
  getQuantityError,
  isValidQuantity,
  normaliseQuantityInput
} from '../../../shared/action-quantity-validation.js'
import {
  AVAILABLE_UNIT_ATTR,
  CHECKBOX_NAME,
  LIVE_AVAILABLE_AREA_ATTR,
  TOTAL_CHOSEN_AREA_ATTR,
  clearChosenArea,
  clearErrorOnLoad,
  getChosenArea,
  getCheckboxes,
  getLiveAvailableArea,
  getQuantityInput,
  getTotalAvailableArea,
  isProtectedFromRefresh,
  setChosenArea
} from './action-checkbox-state.js'
import { clearQuantityError, showQuantityError } from './quantity-error-display.js'
import { formatUnit } from '../../../shared/format-unit.js'
import { getAvailabilityLimit } from '../../../shared/availability.js'
import { isValidCompoundParcelId } from '../../../shared/format-parcel.js'

const UNAVAILABLE_MESSAGE = 'Not compatible with other selected actions.'
const UNAVAILABLE_CLASS = 'select-actions-unavailable-message'
const REFRESH_BANNER_MESSAGE = 'Updating available land for this action…'
const REFRESH_BANNER_CLASS = 'select-actions-refresh-banner'
const REFRESH_BANNER_HIDDEN_CLASS = 'select-actions-refresh-banner--hidden'

/**
 * @param {number} value
 * @param {string} unit
 */
const availabilityHintText = (value, unit) => `${value} ${formatUnit(unit)} available`

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

/**
 * A typed quantity is valid up to the action's own static total - not the
 * live/competed max, which can read lower than a value that's still valid.
 * @param {HTMLInputElement} checkbox
 * @returns {number | undefined}
 */
function getValidTypedQuantity(checkbox) {
  const quantityInput = getQuantityInput(checkbox)
  const raw = quantityInput?.value ?? ''
  return isValidQuantity(raw, getTotalAvailableArea(checkbox)) ? Number(normaliseQuantityInput(raw)) : undefined
}

/**
 * Rewrites a quantity field to its normalised form (".5" becomes "0.5").
 * @param {HTMLInputElement} checkbox
 */
function normaliseAndValidateQuantity(checkbox) {
  const quantityInput = getQuantityInput(checkbox)
  if (!quantityInput) {
    return
  }
  quantityInput.value = normaliseQuantityInput(quantityInput.value)
  const message =
    quantityInput.value === '' ? null : getQuantityError(quantityInput.value, getTotalAvailableArea(checkbox))
  if (message) {
    showQuantityError(quantityInput, message)
  } else {
    clearQuantityError(quantityInput)
  }
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
 * A checked quantity action with no valid typed quantity reverts to its
 * last-confirmed value, or is simply unchecked (with its value cleared) if it
 * has none - an invalid typed value isn't the same as being incompatible with
 * other selections, so it's left to flow through the refresh response like
 * any other unchecked action, not force-disabled here.
 * @param {HTMLElement} form
 */
function uncheckUnconfirmedQuantityActions(form) {
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
      quantityInput.value = ''
      hideConditionalReveal(checkbox)
    }

    clearQuantityError(quantityInput)
  }
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
    clearQuantityError(quantityInput)
  }
  hideConditionalReveal(checkbox)
  toggleUnavailableMessage(checkbox, true)
}

/**
 * Refreshes a quantity input's max, and its action's availability hint, from
 * the latest availability as reported by the API. A null value means no
 * restriction, which has to clear the bound rather than stringify - the server
 * renders neither max (quantity-input/template.njk) nor hint (getHintHtml) in
 * that case, so this keeps the two in step.
 * @param {HTMLInputElement} checkbox
 * @param {{ availability?: ActionAvailability | null }} action
 */
function syncQuantityInputBounds(checkbox, action) {
  const quantityInput = getQuantityInput(checkbox)
  if (!quantityInput || !action.availability) {
    return
  }
  const limit = getAvailabilityLimit(action.availability)
  const hint = document.getElementById(`${quantityInput.id}-hint`)
  if (limit == null) {
    quantityInput.removeAttribute('max')
    if (hint) {
      hint.textContent = ''
    }
    return
  }
  quantityInput.max = String(limit)
  if (hint) {
    hint.textContent = availabilityHintText(limit, action.availability.unit)
  }
}

/**
 * Refreshes a non-quantity action's own "X available" hint (see
 * getActionQuantityFieldName - shares its id with the quantity-action hint
 * pattern) from the latest availability, as reported by the API.
 * @param {HTMLInputElement} checkbox
 * @param {{ availability?: ActionAvailability | null }} action
 */
function syncNonQuantityHint(checkbox, action) {
  const limit = getAvailabilityLimit(action.availability)
  if (getQuantityInput(checkbox) || limit == null) {
    return
  }
  const hint = document.getElementById(`${getActionQuantityFieldName(checkbox.value)}-hint`)
  if (hint) {
    hint.textContent = availabilityHintText(limit, /** @type {ActionAvailability} */ (action.availability).unit)
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
 * Not selected: unavailable when there's nothing (or not enough, for a typed amount)
 * left to claim. An action with no limit at all can never be unavailable - comparing
 * a null value would coerce it to 0 and reject any typed amount above zero.
 * @param {HTMLInputElement} checkbox
 * @param {HTMLInputElement | null} quantityInput
 * @param {ActionAvailability | null} [availability]
 */
function applyUncheckedAvailability(checkbox, quantityInput, availability) {
  const limit = getAvailabilityLimit(availability)
  const isUnavailable =
    limit != null && quantityInput ? limit === 0 || limit < (getValidTypedQuantity(checkbox) ?? 0) : limit === 0
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
 * Checked non-quantity action: when allowed to grow, its chosen area is
 * sentQuantity plus whatever extra headroom this response reports - it has
 * no upper bound of its own, so any land freed up elsewhere is claimable by
 * it. When growth isn't allowed this pass (see applyRefreshResponse), it
 * stays flat at sentQuantity - the response's headroom figure is a
 * hypothetical for THIS action alone and can't be trusted alongside another
 * action's own growth in the same pass. Disables it if nothing's claimed.
 * @param {HTMLInputElement} checkbox
 * @param {number} availabilityValue
 * @param {number} sentQuantity
 * @param {boolean} allowGrowth
 * @returns {boolean} Whether this action's chosen area grew beyond what was sent -
 *   every OTHER action's own availability in this same response was computed
 *   against the smaller, pre-growth claim, so it's now stale.
 */
function applyCheckedNonQuantityAvailability(checkbox, availabilityValue, sentQuantity, allowGrowth) {
  const grows = allowGrowth && availabilityValue > 0
  const chosenArea = grows ? sentQuantity + availabilityValue : sentQuantity
  setChosenArea(checkbox, chosenArea)
  if (chosenArea === 0) {
    markUnavailable(checkbox)
  } else {
    clearUnavailable(checkbox)
  }
  return grows
}

/**
 * Applies one action's response: headroom attribute, quantity bounds, and - if checked - chosen area and disabled state.
 * A protected checkbox (see isProtectedFromRefresh) keeps its own checked
 * state, typed value and chosen area untouched - it's still allowed to be
 * re-enabled/disabled by fresh availability, since that reflects what OTHER
 * actions are doing, not a correction to its own rejected value.
 * @param {HTMLInputElement} checkbox
 * @param {{ availability?: ActionAvailability | null }} action
 * @param {number | undefined} sentQuantity - What we claimed for this action, if checked and included.
 * @param {boolean} isProtected
 * @param {boolean} allowGrowth - Whether a non-quantity action may grow this pass (see applyRefreshResponse).
 * @returns {boolean} Whether this action grew (see applyCheckedNonQuantityAvailability).
 */
function applyAvailability(checkbox, action, sentQuantity, isProtected, allowGrowth) {
  const { availability } = action
  const quantityInput = getQuantityInput(checkbox)
  const limit = getAvailabilityLimit(availability)
  if (availability) {
    checkbox.setAttribute(AVAILABLE_UNIT_ATTR, availability.unit)
  }
  // No limit means no live headroom to record - drop the attribute rather than
  // stringify a null, which would read back as NaN instead of "unrestricted".
  if (limit == null) {
    checkbox.removeAttribute(LIVE_AVAILABLE_AREA_ATTR)
  } else {
    checkbox.setAttribute(LIVE_AVAILABLE_AREA_ATTR, String(limit))
  }

  syncQuantityInputBounds(checkbox, action)
  syncNonQuantityHint(checkbox, action)

  if (!checkbox.checked) {
    applyUncheckedAvailability(checkbox, quantityInput, availability)
    return false
  }
  if (isProtected) {
    clearUnavailable(checkbox)
    return false
  }
  if (quantityInput) {
    applyCheckedQuantityAvailability(checkbox, sentQuantity)
    return false
  }
  if (limit == null) {
    // Nothing can make an unrestricted action incompatible, but disableOtherActions
    // disabled it at the start of this refresh and this is its only way back.
    clearUnavailable(checkbox)
    return false
  }
  return applyCheckedNonQuantityAvailability(checkbox, limit, /** @type {number} */ (sentQuantity), allowGrowth)
}

/**
 * How much of an action is still claimable, as the API reports it. `unit` is
 * always present; a null `value` means no restriction.
 * @typedef {{ value: number | null, unit: string }} ActionAvailability
 */

/**
 * @typedef {{ code: string, availability?: ActionAvailability | null }} ActionAvailabilityUpdate
 */

/**
 * @param {string} parcelId
 * @param {Array<{ actionCode: string, quantity: number, unit: string }>} plannedActions
 * @returns {Promise<ActionAvailabilityUpdate[] | null>}
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
    /** @type {{ actions: ActionAvailabilityUpdate[] }} */
    const { actions = [] } = await response.json()
    return actions
  } catch {
    return null
  }
}

/**
 * Request failed (network error or e.g. 422) - undo disableOtherActions rather than leaving every action stuck disabled.
 * @param {HTMLElement} form
 */
function recoverFromFailedRefresh(form) {
  for (const checkbox of getCheckboxes(form)) {
    if (!isProtectedFromRefresh(checkbox)) {
      clearUnavailable(checkbox)
    }
  }
}

/**
 * Two checked non-quantity actions can each independently be reported as
 * able to claim the SAME freed land in one response - it's a hypothetical
 * "if only this action claimed it" figure per action, not a partition. So at
 * most ONE action is allowed to grow per response (the first, in DOM order);
 * every other one is left at its sent value for this pass. The caller must
 * re-ask (with that one action's new, larger claim already sent) before any
 * other action's own growth can be trusted.
 * @param {HTMLElement} form
 * @param {ActionAvailabilityUpdate[]} actions
 * @param {Array<{ actionCode: string, quantity: number, unit: string }>} plannedActions
 * @returns {boolean} Whether an action grew and a follow-up refresh is needed.
 */
function applyRefreshResponse(form, actions, plannedActions) {
  const sentQuantityByCode = new Map(plannedActions.map((p) => [p.actionCode, p.quantity]))
  let grown = false
  for (const checkbox of getCheckboxes(form)) {
    const action = actions.find((a) => a.code === checkbox.value)
    if (!action) {
      continue
    }
    const allowGrowth = !grown
    const grew = applyAvailability(
      checkbox,
      action,
      sentQuantityByCode.get(checkbox.value),
      isProtectedFromRefresh(checkbox),
      allowGrowth
    )
    grown = grown || grew
  }
  return grown
}

// A non-quantity action's growth changes what's actually planned, so every
// OTHER action's response value from that same call is already stale - cap
// the follow-up chase rather than trust convergence blindly.
const MAX_GROWTH_FOLLOW_UPS = 3

/**
 * @param {HTMLElement} form
 * @param {string} parcelId
 * @returns {(triggeringCheckbox?: HTMLInputElement) => Promise<void>}
 */
function createAvailabilityRefresher(form, parcelId) {
  let requestId = 0

  /**
   * @param {HTMLInputElement} [triggeringCheckbox]
   * @param {number} [followUpsLeft]
   */
  async function refreshAvailability(triggeringCheckbox, followUpsLeft = MAX_GROWTH_FOLLOW_UPS) {
    const isChainStart = followUpsLeft === MAX_GROWTH_FOLLOW_UPS
    uncheckUnconfirmedQuantityActions(form)
    requestId += 1
    const thisRequestId = requestId
    // Loading feedback spans the whole growth-follow-up chain, not just this
    // one call - shown/disabled once at the chain's start, restored again
    // (below) after every response so a follow-up never has a gap where
    // other actions flash back to enabled, and only hidden/re-enabled once
    // the whole chain actually settles.
    if (triggeringCheckbox && isChainStart) {
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

    if (!actions) {
      if (triggeringCheckbox) {
        toggleRefreshBanner(triggeringCheckbox, false)
      }
      recoverFromFailedRefresh(form)
      return
    }

    const anyGrew = applyRefreshResponse(form, actions, plannedActions)
    if (anyGrew && followUpsLeft > 0) {
      if (triggeringCheckbox) {
        // applyRefreshResponse just re-enabled every checkbox with fresh
        // data - restore the "fetch in flight" disabled state immediately,
        // rather than leaving a gap until the follow-up fetch's own response.
        disableOtherActions(form, triggeringCheckbox)
      }
      await refreshAvailability(triggeringCheckbox, followUpsLeft - 1)
      return
    }
    if (triggeringCheckbox) {
      toggleRefreshBanner(triggeringCheckbox, false)
    }
  }

  return refreshAvailability
}

/**
 * Seeds each checked quantity action's last-confirmed value from the
 * server-rendered input, if it's actually valid.
 * @param {HTMLElement} form
 */
function seedConfirmedQuantities(form) {
  for (const checkbox of getCheckboxes(form)) {
    const quantityInput = getQuantityInput(checkbox)
    if (checkbox.checked && quantityInput?.value.trim()) {
      updateHintLive(checkbox)
      const validQuantity = getValidTypedQuantity(checkbox)
      if (validQuantity != null) {
        checkbox.setAttribute(TOTAL_CHOSEN_AREA_ATTR, String(validQuantity))
      }
    }
  }
}

/**
 * @param {HTMLElement} form
 * @param {(triggeringCheckbox?: HTMLInputElement) => Promise<void>} refreshAvailability
 */
function bindCheckboxChangeHandler(form, refreshAvailability) {
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
}

/**
 * @param {HTMLElement} form
 * @param {EventTarget | null} target
 * @returns {HTMLInputElement | null}
 */
function getCheckboxForQuantityTarget(form, target) {
  if (!(target instanceof HTMLInputElement) || !target.name.startsWith(ACTION_QUANTITY_FIELD_PREFIX)) {
    return null
  }
  const checkbox = form.querySelector(
    `input[name="${CHECKBOX_NAME}"][value="${target.name.slice(ACTION_QUANTITY_FIELD_PREFIX.length)}"]`
  )
  return checkbox instanceof HTMLInputElement ? checkbox : null
}

// How long a quantity field must sit idle after the user's last keystroke
// before its refresh fires - long enough to absorb normal typing pauses
// between digits, short enough not to read as unresponsive.
const QUANTITY_INPUT_DEBOUNCE_MS = 500

/**
 * @param {HTMLElement} form
 * @param {(triggeringCheckbox?: HTMLInputElement) => Promise<void>} refreshAvailability
 */
function bindQuantityFocusBlurHandlers(form, refreshAvailability) {
  // Remembers each quantity input's value as of its last focus, so input can
  // tell an actual edit apart from focus merely passing through (e.g. a click
  // landing on a DIFFERENT checkbox first blurs this field with no edit at all).
  let valueOnFocus = ''
  // One pending debounce timer at a time - a quantity field's own input
  // events are the only thing that can (re)start or flush it, and only one
  // field can be focused/edited at once.
  /** @type {{ checkbox: HTMLInputElement, timer: ReturnType<typeof setTimeout> } | null} */
  let pending = null

  function flushPending() {
    if (!pending) {
      return
    }
    const { checkbox } = pending
    clearTimeout(pending.timer)
    pending = null
    if (getValidTypedQuantity(checkbox) != null) {
      refreshAvailability(checkbox)
    }
  }

  form.addEventListener(
    'focus',
    (event) => {
      if (getCheckboxForQuantityTarget(form, event.target)) {
        valueOnFocus = /** @type {HTMLInputElement} */ (event.target).value
      }
    },
    true
  )

  // Debounce while the user is actively typing, rather than waiting for blur.
  form.addEventListener('input', (event) => {
    const checkbox = getCheckboxForQuantityTarget(form, event.target)
    if (!checkbox) {
      return
    }
    if (/** @type {HTMLInputElement} */ (event.target).value !== valueOnFocus) {
      clearErrorOnLoad(checkbox)
      clearQuantityError(getQuantityInput(checkbox))
    }
    if (pending) {
      clearTimeout(pending.timer)
    }
    pending = {
      checkbox,
      timer: setTimeout(flushPending, QUANTITY_INPUT_DEBOUNCE_MS)
    }
  })

  // Leaving the field shouldn't leave a debounce dangling until its timer
  // fires on its own - flush immediately so the refresh isn't delayed past
  // the point the user has already moved on.
  form.addEventListener(
    'blur',
    (event) => {
      const checkbox = getCheckboxForQuantityTarget(form, event.target)
      if (!checkbox) {
        return
      }
      normaliseAndValidateQuantity(checkbox)
      flushPending()
    },
    true
  )
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

  seedConfirmedQuantities(form)

  // Grey out incompatible selections and hydrate chosen areas (see
  // isProtectedFromRefresh for checked/errored exceptions, cleared per
  // checkbox by clearErrorOnLoad below on that checkbox's own next interaction).
  if (buildPlannedActions(form).length > 0) {
    refreshAvailability()
  }

  bindCheckboxChangeHandler(form, refreshAvailability)
  bindQuantityFocusBlurHandlers(form, refreshAvailability)
}

initSelectActionsPage(document.getElementById('select-actions-form'))
