/**
 * Renders and clears a validation error for a land action's quantity field, in
 * both the places every error on this page appears.
 */

const DESCRIBED_BY_ATTR = 'aria-describedby'
const ERROR_SUMMARY_SELECTOR = '.govuk-error-summary'
const ERROR_SUMMARY_LIST_SELECTOR = '.govuk-error-summary__list'
const FORM_GROUP_ERROR_CLASS = 'govuk-form-group--error'
const INPUT_ERROR_CLASS = 'govuk-input--error'

/**
 * The form group wrapping a quantity input - where govuk-frontend puts the
 * error class and the error message, on both the server-rendered and the
 * client-rendered path.
 * @param {HTMLInputElement} quantityInput
 * @returns {HTMLElement | null}
 */
function getQuantityFormGroup(quantityInput) {
  return quantityInput.closest('.govuk-form-group')
}

/**
 * Adds or removes one id from an element's aria-describedby, preserving any
 * others already there.
 * @param {HTMLInputElement} input
 * @param {string} id
 * @param {boolean} shouldDescribe
 */
function toggleDescribedBy(input, id, shouldDescribe) {
  const ids = (input.getAttribute(DESCRIBED_BY_ATTR) ?? '').split(/\s+/).filter((entry) => entry && entry !== id)
  if (shouldDescribe) {
    ids.push(id)
  }
  if (ids.length) {
    input.setAttribute(DESCRIBED_BY_ATTR, ids.join(' '))
  } else {
    input.removeAttribute(DESCRIBED_BY_ATTR)
  }
}

/**
 * The page's error summary, created if this is the first error on the page.
 * @param {HTMLInputElement} quantityInput
 * @returns {HTMLElement | null}
 */
function getOrCreateErrorSummary(quantityInput) {
  const column = quantityInput.form?.parentElement
  if (!column) {
    return null
  }
  const existing = column.querySelector(ERROR_SUMMARY_SELECTOR)
  if (existing) {
    return /** @type {HTMLElement} */ (existing)
  }
  const summary = document.createElement('div')
  summary.className = 'govuk-error-summary'
  summary.dataset.module = 'govuk-error-summary'
  const alert = document.createElement('div')
  alert.setAttribute('role', 'alert')
  const title = document.createElement('h2')
  title.className = 'govuk-error-summary__title'
  title.textContent = 'There is a problem'
  const body = document.createElement('div')
  body.className = 'govuk-error-summary__body'
  const list = document.createElement('ul')
  list.className = 'govuk-list govuk-error-summary__list'
  body.appendChild(list)
  alert.append(title, body)
  summary.appendChild(alert)
  column.prepend(summary)
  return summary
}

/**
 * Adds or updates this field's entry in the error summary.
 * @param {HTMLInputElement} quantityInput
 * @param {string} message
 */
function upsertErrorSummaryEntry(quantityInput, message) {
  const summary = getOrCreateErrorSummary(quantityInput)
  const list = summary?.querySelector(ERROR_SUMMARY_LIST_SELECTOR)
  if (!list) {
    return
  }
  const href = `#${quantityInput.id}`
  const existing = list.querySelector(`a[href="${href}"]`)
  if (existing) {
    existing.textContent = message
    return
  }
  const item = document.createElement('li')
  const link = document.createElement('a')
  link.href = href
  link.textContent = message
  item.appendChild(link)
  list.appendChild(item)
}

/**
 * Takes this field's entry out of the error summary, and the summary itself
 * once it has nothing left to report.
 * @param {HTMLInputElement} quantityInput
 */
function removeErrorSummaryEntry(quantityInput) {
  const summary = quantityInput.form?.parentElement?.querySelector(ERROR_SUMMARY_SELECTOR)
  const list = summary?.querySelector(ERROR_SUMMARY_LIST_SELECTOR)
  list?.querySelector(`a[href="#${quantityInput.id}"]`)?.closest('li')?.remove()
  if (list?.children.length === 0) {
    summary?.remove()
  }
}

/**
 * Shows an error for a quantity input in both the places every other error on
 * this page appears: the summary at the top, and the field itself.
 * @param {HTMLInputElement} quantityInput
 * @param {string} message
 */
export function showQuantityError(quantityInput, message) {
  const formGroup = getQuantityFormGroup(quantityInput)
  if (!formGroup) {
    return
  }
  const errorId = `${quantityInput.id}-error`
  let errorMessage = document.getElementById(errorId)
  if (!errorMessage) {
    errorMessage = document.createElement('p')
    errorMessage.id = errorId
    errorMessage.className = 'govuk-error-message'

    formGroup.querySelector('.govuk-input__wrapper')?.before(errorMessage)
  }
  const visuallyHidden = document.createElement('span')
  visuallyHidden.className = 'govuk-visually-hidden'
  visuallyHidden.textContent = 'Error:'
  errorMessage.replaceChildren(visuallyHidden, document.createTextNode(` ${message}`))

  formGroup.classList.add(FORM_GROUP_ERROR_CLASS)
  quantityInput.classList.add(INPUT_ERROR_CLASS)
  toggleDescribedBy(quantityInput, errorId, true)
  upsertErrorSummaryEntry(quantityInput, message)
}

/**
 * Clears the error from both places it was shown.
 * @param {HTMLInputElement | null} quantityInput
 */
export function clearQuantityError(quantityInput) {
  if (!quantityInput) {
    return
  }
  document.getElementById(`${quantityInput.id}-error`)?.remove()
  getQuantityFormGroup(quantityInput)?.classList.remove(FORM_GROUP_ERROR_CLASS)
  quantityInput.classList.remove(INPUT_ERROR_CLASS)
  toggleDescribedBy(quantityInput, `${quantityInput.id}-error`, false)
  removeErrorSummaryEntry(quantityInput)
}
