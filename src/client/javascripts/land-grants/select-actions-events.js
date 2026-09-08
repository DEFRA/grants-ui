/**
 * Binds the DOM events that drive select-actions-availability.js's engine:
 * checkbox changes, quantity-field focus/blur/debounced-input, and the
 * submit guard. select-actions-page.js is the entry point that calls
 * initSelectActionsPage, this module's only export.
 */

import { ACTION_QUANTITY_FIELD_PREFIX } from '../../../shared/action-quantity-field.js'
import { isValidCompoundParcelId } from '../../../shared/format-parcel.js'
import { CHECKBOX_NAME, clearChosenArea, clearErrorOnLoad, getQuantityInput } from './action-checkbox-state.js'
import { clearQuantityError } from './quantity-error-display.js'
import {
  buildPlannedActions,
  createAvailabilityRefresher,
  getValidTypedQuantity,
  normaliseAndValidateQuantity,
  seedConfirmedQuantities
} from './select-actions-availability.js'

/**
 * The form's own submit control, however govukButton rendered it - a
 * <button> by default, or an <input> if the page overrides element: 'input'.
 * Scoped to THIS form's descendants (not document.querySelector) - the page
 * can have other forms on it (e.g. the cookie banner, rendered as a sibling
 * form earlier in the DOM), which must never be reached from here.
 * @param {HTMLElement} form
 * @returns {HTMLButtonElement | HTMLInputElement | null}
 */
function getSubmitButton(form) {
  return form.querySelector('button[type="submit"], input[type="submit"]')
}

/**
 * Disables the submit button while a refresh is in flight, so the user sees
 * why they can't proceed yet rather than clicking into bindSubmitGuard's
 * silent no-op. aria-disabled mirrors what govukButton itself renders for a
 * server-disabled button (see button/template.njk), so this reads the same
 * way to assistive tech as a page that loaded already disabled.
 * @param {HTMLButtonElement | HTMLInputElement} button
 * @param {boolean} isLoading
 */
function toggleSubmitButtonDisabled(button, isLoading) {
  button.disabled = isLoading
  button.setAttribute('aria-disabled', String(isLoading))
}

/**
 * Tracks chains currently running, including overlapping ones (e.g. the
 * untriggered init refresh racing a user's own change) - see bindSubmitGuard.
 * Also disables the submit button for the same span, so the user sees why
 * they can't proceed yet rather than hitting bindSubmitGuard's silent no-op.
 * @param {(triggeringCheckbox?: HTMLInputElement) => Promise<void>} refreshAvailability
 * @param {HTMLButtonElement | HTMLInputElement | null} submitButton
 * @returns {{
 *   refreshAvailability: (triggeringCheckbox?: HTMLInputElement) => Promise<void>,
 *   isRefreshInFlight: () => boolean
 * }}
 */
function withInFlightTracking(refreshAvailability, submitButton) {
  let inFlightCount = 0

  /** @param {HTMLInputElement} [triggeringCheckbox] */
  async function tracked(triggeringCheckbox) {
    inFlightCount += 1
    if (submitButton && inFlightCount === 1) {
      toggleSubmitButtonDisabled(submitButton, true)
    }
    try {
      await refreshAvailability(triggeringCheckbox)
    } finally {
      inFlightCount -= 1
      if (submitButton && inFlightCount === 0) {
        toggleSubmitButtonDisabled(submitButton, false)
      }
    }
  }

  return { refreshAvailability: tracked, isRefreshInFlight: () => inFlightCount > 0 }
}

/**
 * Blocks a submit mid-refresh - disableOtherActions' disabled fields would
 * otherwise drop silently from it. Belt-and-braces alongside the disabled
 * submit button (see withInFlightTracking): a disabled button already stops
 * a click/Enter-on-button submit, but Enter pressed in a text field submits
 * the form directly, bypassing the button's own disabled state entirely.
 * @param {HTMLElement} form
 * @param {() => boolean} isRefreshInFlight
 */
function bindSubmitGuard(form, isRefreshInFlight) {
  form.addEventListener('submit', (event) => {
    if (isRefreshInFlight()) {
      event.preventDefault()
    }
  })
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

  const { refreshAvailability, isRefreshInFlight } = withInFlightTracking(
    createAvailabilityRefresher(form, parcelId),
    getSubmitButton(form)
  )

  seedConfirmedQuantities(form)

  // Grey out incompatible selections and hydrate chosen areas (see
  // isProtectedFromRefresh for checked/errored exceptions, cleared per
  // checkbox by clearErrorOnLoad below on that checkbox's own next interaction).
  if (buildPlannedActions(form).length > 0) {
    refreshAvailability()
  }

  bindCheckboxChangeHandler(form, refreshAvailability)
  bindQuantityFocusBlurHandlers(form, refreshAvailability)
  bindSubmitGuard(form, isRefreshInFlight)
}
