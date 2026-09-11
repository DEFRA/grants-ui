// @ts-nocheck
import { vi } from 'vitest'
import { initSelectActionsPage } from './select-actions-page.js'

export const areaText = (value) => `${Number(value).toFixed(4)} hectares`

const HIDDEN_CLASS = 'govuk-checkboxes__conditional--hidden'

const unitLabel = (availability) => (availability?.unit === 'sqm' ? 'square metres' : 'ha')

const unitAlternativeLabel = (availability) => {
  const label = unitLabel(availability)
  return label === 'square metres' ? 'm²' : label
}

// Stamped server-side per checkbox for a checked action redisplayed from a
// rejected submission (see mapActionToViewModel) - not a single form-wide flag.
const errorOnLoadAttr = (errorOnLoad) => (errorOnLoad ? ' data-error-on-load="true"' : '')

const describedByAttr = ({ code, unrestricted, hasError }) => {
  const ids = [
    unrestricted ? '' : `landActionQuantity_${code}-hint`,
    hasError ? `landActionQuantity_${code}-error` : ''
  ]
    .filter(Boolean)
    .join(' ')
  return ids ? ` aria-describedby="${ids}"` : ''
}

// Matches govuk-frontend's real markup: the conditional reveal is a SIBLING
// of .govuk-checkboxes__item, not nested inside it, and is only visible
// (no --hidden class) when the checkbox starts out checked.
function quantityConditionalHtml({
  code,
  checked,
  hasError,
  quantityValue,
  unrestricted,
  requiresMaxQuantity,
  availability,
  conditionalId
}) {
  if (!requiresMaxQuantity) {
    return ''
  }
  const inputClass = `govuk-input${hasError ? ' govuk-input--error' : ''}`
  const errorMessage = hasError
    ? `<p id="landActionQuantity_${code}-error" class="govuk-error-message"><span class="govuk-visually-hidden">Error:</span> Enter a number of hectares, for example 12.5 or 100</p>`
    : ''
  return `
    <div class="govuk-checkboxes__conditional${checked ? '' : ` ${HIDDEN_CLASS}`}" id="${conditionalId}">
        <div class="govuk-form-group${hasError ? ' govuk-form-group--error' : ''}">
          <label class="govuk-label" for="landActionQuantity_${code}">Quantity</label>
          ${errorMessage}
          <div class="govuk-input__wrapper">
            <div id="landActionQuantity_${code}-refresh-banner" class="select-actions-refresh-banner select-actions-refresh-banner--hidden">Updating available land for this action&hellip;</div>
            <input class="${inputClass}" id="landActionQuantity_${code}" name="landActionQuantity_${code}" type="text" value="${quantityValue}"${describedByAttr({ code, unrestricted, hasError })}${unrestricted ? '' : ` max="${requiresMaxQuantity}"`}>
            <div class="govuk-input__suffix">${unitAlternativeLabel(availability)}</div>
          </div>
        </div>
      </div>`
}

function hintValueFor({ requiresMaxQuantity, unrestricted, availability }) {
  if (requiresMaxQuantity) {
    return unrestricted ? null : requiresMaxQuantity
  }
  return availability?.value ?? null
}

function availabilityHintHtml({ code, requiresMaxQuantity, unrestricted, availability }) {
  const hintValue = hintValueFor({ requiresMaxQuantity, unrestricted, availability })
  return hintValue != null
    ? `<span id="landActionQuantity_${code}-hint">${hintValue} ${unitLabel(availability)} available</span>`
    : ''
}

function chosenAreaPanelHtml({ code, checked, chosenArea, availability, hasChosenAreaPanel, conditionalId }) {
  if (!hasChosenAreaPanel) {
    return ''
  }
  const hiddenClass = checked ? '' : ` ${HIDDEN_CLASS}`
  return `
    <div class="govuk-checkboxes__conditional${hiddenClass}" id="${conditionalId}">
        <p>Quantity</p>
        <p id="landActionChosenArea_${code}">${areaText(chosenArea ?? availability.value)}</p>
      </div>`
}

export function checkboxItemHtml({
  code,
  checked = false,
  availability,
  requiresMaxQuantity,
  unrestricted = false,
  quantityValue = '',
  chosenArea,
  hasError = false,
  errorOnLoad = false
}) {
  const conditionalId = `conditional-landAction-${code}`
  const hasChosenAreaPanel = !requiresMaxQuantity && availability?.value != null
  const unitAttr = availability ? ` data-available-unit="${availability.unit}"` : ''
  const totalAreaAttr = availability ? ` data-total-available-area="${availability.value ?? ''}"` : ''
  const ariaControlsAttr = requiresMaxQuantity || hasChosenAreaPanel ? ` aria-controls="${conditionalId}"` : ''

  const conditional = quantityConditionalHtml({
    code,
    checked,
    hasError,
    quantityValue,
    unrestricted,
    requiresMaxQuantity,
    availability,
    conditionalId
  })
  const availabilityHint = availabilityHintHtml({ code, requiresMaxQuantity, unrestricted, availability })
  const chosenAreaPanel = chosenAreaPanelHtml({
    code,
    checked,
    chosenArea,
    availability,
    hasChosenAreaPanel,
    conditionalId
  })

  return `
    <div class="govuk-checkboxes__item">
      <input class="govuk-checkboxes__input" id="landAction-${code}" name="landAction" type="checkbox" value="${code}"${checked ? ' checked' : ''}${unitAttr}${totalAreaAttr}${ariaControlsAttr}${errorOnLoadAttr(errorOnLoad)}>
      <label for="landAction-${code}">${code}</label>
      ${availabilityHint}
    </div>
    ${conditional}${chosenAreaPanel}`
}

// Matches the server: a non-quantity action's chosen area is a plain hidden
// field outside the checkboxes list (same field name as a quantity action's
// real input, distinguished by type="hidden"), not a conditional reveal.
export function chosenAreaFieldHtml({ code, requiresMaxQuantity, chosenArea }) {
  if (requiresMaxQuantity) {
    return ''
  }
  return `<input type="hidden" id="landActionQuantity_${code}" name="landActionQuantity_${code}" value="${chosenArea ?? 0}">`
}

/**
 * hasErrors stamps data-error-on-load onto every CHECKED item, matching
 * mapActionToViewModel. summaryErrors renders the govukErrorSummary the server
 * puts above the heading, as a sibling of the form inside the content column.
 */
export function setupDom(items, { hasErrors = false, summaryErrors = [] } = {}) {
  const withErrorFlag = items.map((item) => ({ ...item, errorOnLoad: hasErrors && item.checked }))
  const summary = summaryErrors.length
    ? `<div class="govuk-error-summary" data-module="govuk-error-summary">
         <div role="alert">
           <h2 class="govuk-error-summary__title">There is a problem</h2>
           <div class="govuk-error-summary__body">
             <ul class="govuk-list govuk-error-summary__list">
               ${summaryErrors.map((e) => `<li><a href="${e.href}">${e.text}</a></li>`).join('\n')}
             </ul>
           </div>
         </div>
       </div>`
    : ''
  document.body.innerHTML = `
    <div class="govuk-grid-column-three-quarters-from-desktop">
      ${summary}
      <h1 class="govuk-heading-l">Select actions for this land parcel</h1>
      <form method="post">
        <input type="hidden" name="crumb" value="test-crumb-value">
        ${withErrorFlag.map(chosenAreaFieldHtml).join('\n')}
        <div class="govuk-checkboxes" data-module="govuk-checkboxes">
          ${withErrorFlag.map(checkboxItemHtml).join('\n')}
        </div>
        <button type="submit" class="govuk-button" data-module="govuk-button">Continue</button>
      </form>
    </div>`
  return document.querySelector('form')
}

/** @param {HTMLElement} form */
export const submitButton = (form) => form.querySelector('button[type="submit"]')

/** @param {HTMLInputElement} checkboxEl */
export function isConditionalHidden(checkboxEl) {
  const conditionalId = checkboxEl.getAttribute('aria-controls')
  return document.getElementById(conditionalId).classList.contains(HIDDEN_CLASS)
}

/** A non-quantity action's chosen area lives in its hidden field, sharing the checked action's quantity field id. */
export function getChosenAreaFieldValue(checkboxEl) {
  return document.getElementById(`landActionQuantity_${checkboxEl.value}`).value
}

/**
 * Simulates the real land-grants API: availability for a code is headroom
 * BEYOND any claim already made for that same code in this request - 0
 * whenever the code itself is present in plannedActions (it's already
 * claiming its own share, so no MORE is left for it - self-competing), or
 * whenever a DIFFERENT code competes for the same land. Only a code that's
 * both absent from plannedActions and uncontested by another code gets its
 * full base value.
 */
export function mockApi(baseAreasByCode) {
  return vi.fn().mockImplementation((_url, options) => {
    const { plannedActions } = JSON.parse(options.body)
    const competingCodes = new Set(plannedActions.map((p) => p.actionCode))
    const actions = Object.entries(baseAreasByCode).map(([code, value]) => ({
      code,
      availability: {
        value: competingCodes.size > 0 ? 0 : value,
        unit: 'ha'
      }
    }))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ actions }) })
  })
}

export function fetchOk(body) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
}

/** A manually-controlled fetch mock: nothing resolves until `resolve(body)` is called. */
export function deferredFetch() {
  let resolveCall
  const mock = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveCall = (body) => resolve({ ok: true, json: () => Promise.resolve(body) })
      })
  )
  return { mock, resolve: (body) => resolveCall(body) }
}

/** Like deferredFetch, but for a chain of calls resolved one at a time, in order. */
export function deferredFetchQueue() {
  const pending = []
  const mock = vi.fn().mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
  return { mock, resolveNext: (body) => pending.shift()({ ok: true, json: () => Promise.resolve(body) }) }
}

// A macrotask boundary reliably drains any depth of pending microtasks.
export const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

export const checkbox = (form, code) => form.querySelector(`input[value="${code}"]`)

export const quantityInputFor = (form, code) => form.querySelector(`#landActionQuantity_${code}`)

export const hintFor = (code) => document.getElementById(`landActionQuantity_${code}-hint`)

/** A total action's read-only claim display (see chosen-area/template.njk). */
export const chosenAreaDisplayFor = (code) => document.getElementById(`landActionChosenArea_${code}`)

// Pass `checked` to drive the checkbox to a specific state rather than just firing the event.
export async function toggle(form, code, checked) {
  const target = checkbox(form, code)
  if (checked !== undefined) {
    target.checked = checked
  }
  target.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

// Blurring flushes the debounce immediately, rather than waiting for the timer.
export async function typeQuantity(form, code, value) {
  const input = quantityInputFor(form, code)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('blur'))
  await flushPromises()
  return input
}

export const sentPlannedActions = (callIndex = 0) =>
  JSON.parse(global.fetch.mock.calls[callIndex][1].body).plannedActions

export async function initSettled(form, fetchMock) {
  global.fetch = fetchMock
  initSelectActionsPage(form)
  await flushPromises()
  global.fetch.mockClear()
}
