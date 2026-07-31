// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSelectActionsPage } from './select-actions-page.js'

function checkboxItemHtml({
  code,
  checked = false,
  availableArea,
  requiresMaxQuantity,
  quantityValue = '',
  hasError = false,
  errorOnLoad = false
}) {
  const unitAttr = availableArea ? ` data-available-unit="${availableArea.unit}"` : ''
  const totalAreaAttr = availableArea ? ` data-total-available-area="${availableArea.value}"` : ''
  // Stamped server-side per checkbox for a checked action redisplayed from a
  // rejected submission (see mapActionToViewModel) - not a single form-wide flag.
  const errorOnLoadAttr = errorOnLoad ? ' data-error-on-load="true"' : ''
  const conditionalId = `conditional-landAction-${code}`
  const ariaControlsAttr = requiresMaxQuantity ? ` aria-controls="${conditionalId}"` : ''
  // Matches govuk-frontend's real markup: the conditional reveal is a SIBLING
  // of .govuk-checkboxes__item, not nested inside it, and is only visible
  // (no --hidden class) when the checkbox starts out checked.
  const inputClass = `govuk-input${hasError ? ' govuk-input--error' : ''}`
  const conditional = requiresMaxQuantity
    ? `
    <div class="govuk-checkboxes__conditional${checked ? '' : ' govuk-checkboxes__conditional--hidden'}" id="${conditionalId}">
        <div class="govuk-form-group">
          <div id="landActionQuantity_${code}-refresh-banner" class="select-actions-refresh-banner select-actions-refresh-banner--hidden">Updating available land for this action&hellip;</div>
          <input class="${inputClass}" id="landActionQuantity_${code}" name="landActionQuantity_${code}" type="text" value="${quantityValue}" max="${requiresMaxQuantity}">
          <div id="landActionQuantity_${code}-hint">${requiresMaxQuantity} ha available</div>
          <div class="govuk-input__suffix">ha</div>
        </div>
      </div>`
    : ''
  // Matches mapActionToViewModel: a non-quantity action gets its own "X
  // available" hint, kept live by the client (see syncNonQuantityHint).
  const nonQuantityHint =
    !requiresMaxQuantity && availableArea
      ? `<span id="landActionQuantity_${code}-hint">${availableArea.value} ha available</span>`
      : ''
  return `
    <div class="govuk-checkboxes__item">
      <input class="govuk-checkboxes__input" id="landAction-${code}" name="landAction" type="checkbox" value="${code}"${checked ? ' checked' : ''}${unitAttr}${totalAreaAttr}${ariaControlsAttr}${errorOnLoadAttr}>
      <label for="landAction-${code}">${code}</label>
      ${nonQuantityHint}
    </div>
    ${conditional}`
}

// Matches the server: a non-quantity action's chosen area is a plain hidden
// field outside the checkboxes list (same field name as a quantity action's
// real input, distinguished by type="hidden"), not a conditional reveal.
function chosenAreaFieldHtml({ code, requiresMaxQuantity, chosenArea }) {
  if (requiresMaxQuantity) {
    return ''
  }
  return `<input type="hidden" id="landActionQuantity_${code}" name="landActionQuantity_${code}" value="${chosenArea ?? 0}">`
}

/** hasErrors stamps data-error-on-load onto every CHECKED item, matching mapActionToViewModel. */
function setupDom(items, { hasErrors = false } = {}) {
  const withErrorFlag = items.map((item) => ({ ...item, errorOnLoad: hasErrors && item.checked }))
  document.body.innerHTML = `
    <form method="post">
      <input type="hidden" name="crumb" value="test-crumb-value">
      ${withErrorFlag.map(chosenAreaFieldHtml).join('\n')}
      <div class="govuk-checkboxes" data-module="govuk-checkboxes">
        ${withErrorFlag.map(checkboxItemHtml).join('\n')}
      </div>
    </form>`
  return document.querySelector('form')
}

/** @param {HTMLInputElement} checkbox */
function isConditionalHidden(checkbox) {
  const conditionalId = checkbox.getAttribute('aria-controls')
  return document.getElementById(conditionalId).classList.contains('govuk-checkboxes__conditional--hidden')
}

/** A non-quantity action's chosen area lives in its hidden field, sharing the checked action's quantity field id. */
function getChosenAreaFieldValue(checkbox) {
  return document.getElementById(`landActionQuantity_${checkbox.value}`).value
}

/**
 * Simulates the real land-grants API: availableArea for a code is headroom
 * BEYOND any claim already made for that same code in this request - 0
 * whenever the code itself is present in plannedActions (it's already
 * claiming its own share, so no MORE is left for it - self-competing), or
 * whenever a DIFFERENT code competes for the same land. Only a code that's
 * both absent from plannedActions and uncontested by another code gets its
 * full base value.
 */
function mockApi(baseAreasByCode) {
  return vi.fn().mockImplementation((url, options) => {
    const { plannedActions } = JSON.parse(options.body)
    const competingCodes = new Set(plannedActions.map((p) => p.actionCode))
    const actions = Object.entries(baseAreasByCode).map(([code, value]) => ({
      code,
      availableArea: {
        value: competingCodes.size > 0 ? 0 : value,
        unit: 'ha'
      }
    }))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ actions }) })
  })
}

function fetchOk(body) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
}

// A macrotask boundary reliably drains any depth of pending microtasks.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('initSelectActionsPage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.history.pushState(null, '', '/select-actions?parcelId=SD7946-0155')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('is a no-op when passed no form', () => {
    global.fetch = vi.fn()
    expect(() => initSelectActionsPage(null)).not.toThrow()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('is a no-op when the URL has no parcelId', () => {
    window.history.pushState(null, '', '/select-actions')
    const form = setupDom([{ code: 'CMOR1', availableArea: { value: 10, unit: 'ha' } }])
    global.fetch = vi.fn()

    initSelectActionsPage(form)
    form.querySelector('input[type="checkbox"]').dispatchEvent(new Event('change', { bubbles: true }))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  // The plugin route validates parcelId server-side too, but rejecting a
  // malformed value before it's ever used to build a URL closes off the
  // taint path at the source rather than relying solely on encodeURIComponent.
  it('is a no-op when the URL parcelId does not match the expected shape', () => {
    window.history.pushState(null, '', '/select-actions?parcelId=<script>alert(1)</script>')
    const form = setupDom([{ code: 'CMOR1', availableArea: { value: 10, unit: 'ha' } }])
    global.fetch = vi.fn()

    initSelectActionsPage(form)
    form.querySelector('input[type="checkbox"]').dispatchEvent(new Event('change', { bubbles: true }))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('always sends one request with the full, unfiltered plannedActions list', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availableArea: { value: 10, unit: 'ha' } },
      { code: 'UPL1', checked: true, availableArea: { value: 5, unit: 'ha' } }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    form.querySelector('input[value="CMOR1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/land-grants/actions/SD7946-0155',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({
          plannedActions: [
            { actionCode: 'CMOR1', quantity: 10, unit: 'ha' },
            { actionCode: 'UPL1', quantity: 5, unit: 'ha' }
          ]
        })
      })
    )
  })

  it('runs an initial refresh on load when an action is already checked (saved state)', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '3.25'
      },
      { code: 'CLIG3', availableArea: { value: 45.2, unit: 'ha' } }
    ])
    global.fetch = fetchOk({ actions: [] })

    initSelectActionsPage(form)
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/land-grants/actions/SD7946-0155',
      expect.objectContaining({
        body: JSON.stringify({
          plannedActions: [{ actionCode: 'CSAM3', quantity: 3.25, unit: 'ha' }]
        })
      })
    )
  })

  it('runs the on-load refresh after a failed submit, but never touches a checked action while greying out an unchecked one', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availableArea: { value: 0.3271, unit: 'ha' },
          requiresMaxQuantity: 0.3271,
          quantityValue: '0.2'
        },
        { code: 'CLIG3', checked: false, availableArea: { value: 0.3271, unit: 'ha' } }
      ],
      { hasErrors: true }
    )
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 },
        { code: 'CLIG3', availableArea: { value: 0, unit: 'ha' } }
      ]
    })

    initSelectActionsPage(form)
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const csam3Checkbox = form.querySelector('input[value="CSAM3"]')
    const csam3QuantityInput = form.querySelector('#landActionQuantity_CSAM3')
    expect(csam3Checkbox.checked).toBe(true)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(csam3QuantityInput.value).toBe('0.2')

    const clig3Checkbox = form.querySelector('input[value="CLIG3"]')
    expect(clig3Checkbox.checked).toBe(false)
    expect(clig3Checkbox.disabled).toBe(true)
  })

  it('updates a non-quantity action hidden field on a fresh interaction after the initial errors-page load settles', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availableArea: { value: 6.3008, unit: 'ha' },
          requiresMaxQuantity: 6.3008,
          quantityValue: '777',
          hasError: true
        },
        { code: 'CLIG3', checked: true, availableArea: { value: 6.3008, unit: 'ha' }, chosenArea: 1.3008 }
      ],
      { hasErrors: true }
    )
    global.fetch = fetchOk({ actions: [{ code: 'CLIG3', availableArea: { value: 1.3008, unit: 'ha' } }] })
    initSelectActionsPage(form)
    await flushPromises()

    const clig3Checkbox = form.querySelector('input[value="CLIG3"]')
    clig3Checkbox.checked = false
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    // The claim just sent for CLIG3 (1.3008, its live headroom from the
    // first response) plus the extra headroom this response reports (5) -
    // the API contract is additive, not a flat replacement. Growth triggers
    // a follow-up refresh, so the mock must report CLIG3 as self-competing
    // (0 extra) once its own sent claim already covers the full total.
    global.fetch = vi.fn().mockImplementation((url, options) => {
      const { plannedActions } = JSON.parse(options.body)
      const clig3Quantity = plannedActions.find((p) => p.actionCode === 'CLIG3')?.quantity ?? 0
      const value = clig3Quantity >= 6.3008 ? 0 : 5
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ actions: [{ code: 'CLIG3', availableArea: { value, unit: 'ha' } }] })
      })
    })
    clig3Checkbox.checked = true
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(getChosenAreaFieldValue(clig3Checkbox)).toBe('6.3008')
    const csam3Checkbox = form.querySelector('input[value="CSAM3"]')
    expect(csam3Checkbox.checked).toBe(true)
    expect(form.querySelector('#landActionQuantity_CSAM3').value).toBe('777')
  })

  it('re-enables a protected checked action once another action frees up land, without touching its value or error', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availableArea: { value: 6.3008, unit: 'ha' },
          requiresMaxQuantity: 6.3008,
          quantityValue: '777',
          hasError: true
        },
        { code: 'CLIG3', checked: true, availableArea: { value: 6.3008, unit: 'ha' }, chosenArea: 1.3008 }
      ],
      { hasErrors: true }
    )
    global.fetch = mockApi({ CSAM3: 0, CLIG3: 1.3008 })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3Checkbox = form.querySelector('input[value="CSAM3"]')
    expect(csam3Checkbox.disabled).toBe(false)

    const clig3Checkbox = form.querySelector('input[value="CLIG3"]')
    global.fetch = mockApi({ CSAM3: 6.3008, CLIG3: 6.3008 })
    clig3Checkbox.checked = false
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(csam3Checkbox.checked).toBe(true)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(form.querySelector('#landActionQuantity_CSAM3').value).toBe('777')
    expect(form.querySelector('.select-actions-unavailable-message')).toBeNull()
  })

  it('keeps a protected action checked when its field is merely focused/blurred (not edited) before another action is unchecked', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availableArea: { value: 6.3008, unit: 'ha' },
          requiresMaxQuantity: 6.3008,
          quantityValue: '777',
          hasError: true
        },
        { code: 'CLIG3', checked: true, availableArea: { value: 6.3008, unit: 'ha' }, chosenArea: 1.3008 }
      ],
      { hasErrors: true }
    )
    global.fetch = mockApi({ CSAM3: 0, CLIG3: 1.3008 })
    initSelectActionsPage(form)
    await flushPromises()

    // Clicking a different checkbox first blurs CSAM3's field via focus
    // change, with no edit to its value - must not clear its protection.
    const csam3Input = form.querySelector('#landActionQuantity_CSAM3')
    csam3Input.dispatchEvent(new Event('focus'))
    csam3Input.dispatchEvent(new Event('blur'))

    const clig3Checkbox = form.querySelector('input[value="CLIG3"]')
    global.fetch = mockApi({ CSAM3: 6.3008, CLIG3: 6.3008 })
    clig3Checkbox.checked = false
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const csam3Checkbox = form.querySelector('input[value="CSAM3"]')
    expect(csam3Checkbox.checked).toBe(true)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(csam3Input.value).toBe('777')
  })

  it('reverts a checked quantity action to its valid on-load value, staying checked and enabled, after an invalid edit and unchecking a different action', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availableArea: { value: 9, unit: 'ha' },
          requiresMaxQuantity: 9,
          quantityValue: '2',
          hasError: true
        },
        { code: 'CLIG3', checked: true, availableArea: { value: 9, unit: 'ha' }, chosenArea: 2.3161 }
      ],
      { hasErrors: true }
    )
    global.fetch = mockApi({ CSAM3: 0, CLIG3: 2.3161 })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3Checkbox = form.querySelector('input[value="CSAM3"]')
    const csam3Input = form.querySelector('#landActionQuantity_CSAM3')
    expect(csam3Checkbox.disabled).toBe(false)

    // A genuine edit clears CSAM3's own protection.
    csam3Input.dispatchEvent(new Event('focus'))
    csam3Input.value = '9999'
    csam3Input.dispatchEvent(new Event('blur'))

    const clig3Checkbox = form.querySelector('input[value="CLIG3"]')
    global.fetch = mockApi({ CSAM3: 9, CLIG3: 9 })
    clig3Checkbox.checked = false
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(csam3Checkbox.checked).toBe(true)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(csam3Input.value).toBe('2')
  })

  it('unchecks (without disabling) a checked action that was already invalid on load, after it is edited to another invalid value and a different action is unchecked', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availableArea: { value: 9, unit: 'ha' },
          requiresMaxQuantity: 9,
          quantityValue: '33',
          hasError: true
        },
        { code: 'CLIG3', checked: false, availableArea: { value: 9, unit: 'ha' } }
      ],
      { hasErrors: true }
    )
    global.fetch = mockApi({ CSAM3: 9 })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3Checkbox = form.querySelector('input[value="CSAM3"]')
    const csam3Input = form.querySelector('#landActionQuantity_CSAM3')

    const clig3Checkbox = form.querySelector('input[value="CLIG3"]')
    global.fetch = mockApi({ CSAM3: 9, CLIG3: 9 })
    clig3Checkbox.checked = true
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    csam3Input.dispatchEvent(new Event('focus'))
    csam3Input.value = 'asdhasd'
    csam3Input.dispatchEvent(new Event('blur'))

    global.fetch = mockApi({ CSAM3: 9, CLIG3: 9 })
    clig3Checkbox.checked = false
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(csam3Checkbox.checked).toBe(false)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(csam3Input.value).toBe('')
    expect(csam3Checkbox.closest('.govuk-checkboxes__item').textContent).not.toContain(
      'Not compatible with other selected actions.'
    )
  })

  it('includes a checked action from an errors-page load in plannedActions when a different action is checked', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availableArea: { value: 0.3271, unit: 'ha' },
          requiresMaxQuantity: 0.3271,
          quantityValue: '0.2'
        },
        { code: 'CLIG3', checked: false, availableArea: { value: 0.3271, unit: 'ha' } },
        { code: 'CMOR1', availableArea: { value: 10, unit: 'ha' } }
      ],
      { hasErrors: true }
    )
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    form.querySelector('input[value="CMOR1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toContainEqual({ actionCode: 'CSAM3', quantity: 0.2, unit: 'ha' })
  })

  it('never disables, unchecks or resets a checked action whose quantity input already has a validation error', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 0.3271, unit: 'ha' },
        // requiresMaxQuantity is lower than quantityValue to simulate a stale server-rendered max.
        requiresMaxQuantity: 0.0271,
        quantityValue: '0.3',
        hasError: true
      },
      { code: 'CLIG3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, chosenArea: 0.15 }
    ])
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 },
        { code: 'CLIG3', availableArea: { value: 0, unit: 'ha' } }
      ]
    })

    initSelectActionsPage(form)
    await flushPromises()

    const csam3Checkbox = form.querySelector('input[value="CSAM3"]')
    const csam3QuantityInput = form.querySelector('#landActionQuantity_CSAM3')

    expect(csam3Checkbox.checked).toBe(true)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(csam3QuantityInput.disabled).toBe(false)
    expect(csam3QuantityInput.value).toBe('0.3')
    expect(isConditionalHidden(csam3Checkbox)).toBe(false)
  })

  it('does not run an initial refresh on load when nothing is checked', () => {
    const form = setupDom([{ code: 'CLIG3', availableArea: { value: 45.2, unit: 'ha' } }])
    global.fetch = vi.fn()

    initSelectActionsPage(form)

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('updates a pre-selected quantity input hint on load to reflect what remains after its own saved value', () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '3.25'
      }
    ])
    global.fetch = vi.fn()

    initSelectActionsPage(form)

    expect(document.getElementById('landActionQuantity_CSAM3-hint').textContent).toBe('15.25 hectares available')
  })

  // The route validates crumb in restful mode (X-CSRF-Token header) rather
  // than the default payload-field mode, so a fetch() call never trips
  // @hapi/crumb's autoGenerate into silently rotating the cookie and
  // invalidating the crumb already embedded in the page's hidden form field.
  it('sends the crumb from the hidden form field as the X-CSRF-Token header', async () => {
    const form = setupDom([{ code: 'CMOR1', checked: true, availableArea: { value: 10, unit: 'ha' } }])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    form.querySelector('input[value="CMOR1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-CSRF-Token': 'test-crumb-value' })
      })
    )
  })

  // Checking a quantity-required action with no quantity typed yet doesn't
  // change anything it contributes to plannedActions (still nothing) - so
  // there's nothing new to ask the backend about, and no request should fire
  // at all until a quantity is actually typed.
  it('does not fire a request when checking a quantity-required action with no quantity typed yet', async () => {
    const form = setupDom([
      { code: 'CSAM3', availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'CLIG3', availableArea: { value: 45.2, unit: 'ha' } }
    ])
    global.fetch = vi.fn()
    initSelectActionsPage(form)

    const csam3 = form.querySelector('input[value="CSAM3"]')
    csam3.checked = true
    csam3.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(global.fetch).not.toHaveBeenCalled()
    // Nothing has been confirmed yet, so CLIG3 must not be greyed out just
    // because CSAM3's box is checked.
    expect(form.querySelector('input[value="CLIG3"]').disabled).toBe(false)
  })

  it('greys out a different, unchecked action genuinely made unavailable by the one checked action', async () => {
    const form = setupDom([
      { code: 'CLIG3', checked: true, availableArea: { value: 45.2, unit: 'ha' } },
      { code: 'CSAM3', availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    global.fetch = mockApi({ CLIG3: 45.2, CSAM3: 18.5 })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    form.querySelector('input[value="CLIG3"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/land-grants/actions/SD7946-0155',
      expect.objectContaining({
        body: JSON.stringify({ plannedActions: [{ actionCode: 'CLIG3', quantity: 45.2, unit: 'ha' }] })
      })
    )
    const clig3 = form.querySelector('input[value="CLIG3"]')
    const csam3 = form.querySelector('input[value="CSAM3"]')
    expect(clig3.disabled).toBe(false)
    expect(csam3.disabled).toBe(true)
  })

  it('does not grey out a non-quantity action whose availableArea is reduced but still non-zero', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.1'
      },
      { code: 'CLIG3', availableArea: { value: 0.3271, unit: 'ha' } }
    ])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actions: [{ code: 'CLIG3', availableArea: { value: 0.2271, unit: 'ha' } }]
        })
    })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    form.querySelector('input[value="CSAM3"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(form.querySelector('input[value="CLIG3"]').disabled).toBe(false)
  })

  it("updates a non-quantity action's own availability hint from the response", async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.1'
      },
      { code: 'CLIG3', availableArea: { value: 0.3271, unit: 'ha' } }
    ])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actions: [{ code: 'CLIG3', availableArea: { value: 0.2271, unit: 'ha' } }]
        })
    })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    form.querySelector('input[value="CSAM3"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(document.getElementById('landActionQuantity_CLIG3-hint').textContent).toBe('0.2271 hectares available')
  })

  it('unchecks and clears a checked quantity-required action that has no confirmed quantity, without disabling it', async () => {
    const form = setupDom([
      {
        code: 'CLIG3',
        checked: true,
        availableArea: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.25'
      },
      { code: 'CSAM3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 }
    ])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actions: [{ code: 'CSAM3', availableArea: { value: 0.0771, unit: 'ha' }, requiresMaxQuantity: 0.0771 }]
        })
    })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3 = form.querySelector('input[value="CSAM3"]')
    expect(csam3.checked).toBe(false)
    expect(csam3.disabled).toBe(false)
    expect(isConditionalHidden(csam3)).toBe(true)
    expect(csam3.closest('.govuk-checkboxes__item').textContent).not.toContain(
      'Not compatible with other selected actions.'
    )
  })

  // Two genuinely competing, both-checked actions: mockApi zeroes an action's
  // area whenever a DIFFERENT action code is present in plannedActions - so
  // both CSAM3 and UPL1 should grey out once both are checked, since the
  // single request's plannedActions contains both of their claims.
  // Both are checked, so both are skip-disabled from their own self-competing
  // number in this same request - two competing actions the user has BOTH
  // already selected stay enabled (that conflict is surfaced by the
  // application-validation step on submit, not this live-availability check).
  it('does not grey out two already-checked actions competing with each other', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '13.5'
      },
      { code: 'UPL1', checked: true, availableArea: { value: 5, unit: 'ha' } }
    ])
    global.fetch = mockApi({ CSAM3: 18.5, UPL1: 5 })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    form.querySelector('input[value="UPL1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const csam3 = form.querySelector('input[value="CSAM3"]')
    const upl1 = form.querySelector('input[value="UPL1"]')
    expect(csam3.disabled).toBe(false)
    expect(upl1.disabled).toBe(false)
  })

  // Two NON-competing actions: only CSAM3's own claim would ever make CSAM3's
  // area drop, and self-exclusion means that never happens - so UPL1 being
  // checked (a genuinely unrelated action) must not affect CSAM3 at all.
  it('does not grey out an action that a different, non-competing action does not affect', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'UPL1', checked: true, availableArea: { value: 5, unit: 'ha' } }
    ])
    // Neither action's area is reduced by the other being present - simulates
    // two actions that don't compete for the same land.
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actions: [
            { code: 'CSAM3', availableArea: { value: 18.5, unit: 'ha' } },
            { code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }
          ]
        })
    })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    form.querySelector('input[value="UPL1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const csam3 = form.querySelector('input[value="CSAM3"]')
    const upl1 = form.querySelector('input[value="UPL1"]')
    expect(csam3.disabled).toBe(false)
    expect(upl1.disabled).toBe(false)
  })

  it('resets every action back to its unconstrained availableArea when nothing is checked', async () => {
    const form = setupDom([{ code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }])
    const upl1 = form.querySelector('input[value="UPL1"]')
    upl1.disabled = true

    global.fetch = fetchOk({ actions: [{ code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }] })
    initSelectActionsPage(form)

    upl1.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toEqual([])
  })

  // When the action being edited is checked solo, its own request is NOT
  // self-excluded (see createAvailabilityRefresher's editingActionCode
  // handling) - the typed value must reach the server so it can be validated,
  // even though that specific request's returned number for CSAM3 itself is
  // then self-competing and unusable (the merge step falls back to it only
  // because there's no other request to source a clean number from).
  it('uses the typed quantity value over the full available area when present', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '3.25'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toEqual([{ actionCode: 'CSAM3', quantity: 3.25, unit: 'ha' }])
  })

  // A quantity-required action's own hint updates instantly as the user
  // types (total minus typed, computed client-side - no API wait), so
  // there's no gap where typing 0 leaves no way of knowing what the total
  // was. The debounced backend response overwrites it again once it lands.
  // The hint only reflects the server's own confirmed response
  // (syncQuantityInputBounds, after a refresh) - it must not recompute or
  // change as the user types, to avoid showing a number that later turns
  // out to be wrong once a competing action's claim is taken into account.
  it("does not change a quantity input's own hint as the user types, only after a refresh response", async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 }
    ])
    global.fetch = vi.fn()
    initSelectActionsPage(form)

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    const hint = document.getElementById('landActionQuantity_CSAM3-hint')
    const before = hint.textContent

    quantityInput.value = '0.2'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    expect(hint.textContent).toBe(before)
  })

  // A checkbox-triggered refresh (elsewhere on the form) reads the DOM as-is,
  // bypassing the input-event guard - a stale over-limit value already
  // sitting in CSAM3's field is not a confirmed quantity, so CSAM3 is
  // force-unchecked (see uncheckUnconfirmedQuantityActions) and contributes
  // nothing to the request, rather than being sent as a worst-case claim.
  it('excludes a checked action from plannedActions on a checkbox-triggered refresh when its typed quantity exceeds the max', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '25'
      },
      { code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    const upl1 = form.querySelector('input[value="UPL1"]')
    upl1.checked = true
    upl1.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toEqual([{ actionCode: 'UPL1', quantity: 5, unit: 'ha' }])
  })

  it('still fires a request when typing a valid quantity within the latest refreshed max', async () => {
    const form = setupDom([
      { code: 'CLIG3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CLIG3', availableArea: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 }]
    })
    initSelectActionsPage(form)

    const quantityInput = form.querySelector('#landActionQuantity_CLIG3')
    quantityInput.value = '0.1'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    expect(quantityInput.max).toBe('0.2271')
    global.fetch.mockClear()

    quantityInput.value = '0.2'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('allows reducing a quantity at or below its last-confirmed value even when the displayed max reads 0', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 },
      { code: 'CLIG3', availableArea: { value: 0.3271, unit: 'ha' } }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 0.1, unit: 'ha' }, requiresMaxQuantity: 0.1 }]
    })
    const csam3QuantityInput = form.querySelector('#landActionQuantity_CSAM3')
    csam3QuantityInput.value = '0.10'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    initSelectActionsPage(form)
    await flushPromises()

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    form.querySelector('input[value="CLIG3"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(document.getElementById('landActionQuantity_CSAM3-hint').textContent).toBe('0 hectares available')
    global.fetch.mockClear()

    csam3QuantityInput.value = '0.05'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toContainEqual({ actionCode: 'CSAM3', quantity: 0.05, unit: 'ha' })
  })

  it('allows increasing a quantity back up after a reduction, up to the static uncompeted total', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 },
      { code: 'CLIG3', availableArea: { value: 0.3271, unit: 'ha' } }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 0.1, unit: 'ha' }, requiresMaxQuantity: 0.1 }]
    })
    const csam3QuantityInput = form.querySelector('#landActionQuantity_CSAM3')
    csam3QuantityInput.value = '0.10'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    initSelectActionsPage(form)
    await flushPromises()

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    form.querySelector('input[value="CLIG3"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 0.05, unit: 'ha' }, requiresMaxQuantity: 0.05 }]
    })
    csam3QuantityInput.value = '0.05'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()
    global.fetch.mockClear()

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    csam3QuantityInput.value = '0.10'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toContainEqual({ actionCode: 'CSAM3', quantity: 0.1, unit: 'ha' })
  })

  it('still blocks an increase above the static uncompeted total', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 },
      { code: 'CLIG3', availableArea: { value: 0.3271, unit: 'ha' } }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 0.1, unit: 'ha' }, requiresMaxQuantity: 0.1 }]
    })
    const csam3QuantityInput = form.querySelector('#landActionQuantity_CSAM3')
    csam3QuantityInput.value = '0.10'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    initSelectActionsPage(form)
    await flushPromises()

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    form.querySelector('input[value="CLIG3"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    global.fetch.mockClear()

    csam3QuantityInput.value = '0.35'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reverts an in-progress invalid quantity edit to the last confirmed value instead of losing the selection', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 },
      { code: 'CLIG3', availableArea: { value: 0.3271, unit: 'ha' } },
      { code: 'CMOR1', availableArea: { value: 10, unit: 'ha' } }
    ])

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 }]
    })
    const csam3QuantityInput = form.querySelector('#landActionQuantity_CSAM3')
    csam3QuantityInput.value = '0.1'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    initSelectActionsPage(form)
    await flushPromises()

    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 },
        { code: 'CLIG3', availableArea: { value: 0.2271, unit: 'ha' } }
      ]
    })
    form.querySelector('input[value="CLIG3"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    // An in-progress edit, never blurred - no refresh fires for this yet.
    csam3QuantityInput.value = '0.4'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))

    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availableArea: { value: 0.1271, unit: 'ha' }, requiresMaxQuantity: 0.1271 },
        { code: 'CMOR1', availableArea: { value: 9.8, unit: 'ha' } }
      ]
    })
    form.querySelector('input[value="CMOR1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const csam3Checkbox = form.querySelector('input[value="CSAM3"]')
    expect(csam3Checkbox.checked).toBe(true)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(csam3QuantityInput.value).toBe('0.1')

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toContainEqual({ actionCode: 'CSAM3', quantity: 0.1, unit: 'ha' })
  })

  it('includes a checked action in plannedActions when a different action is being edited', async () => {
    const form = setupDom([
      {
        code: 'CLIG3',
        checked: true,
        availableArea: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.25'
      },
      { code: 'CSAM3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 }
    ])

    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    const csam3QuantityInput = form.querySelector('#landActionQuantity_CSAM3')
    csam3QuantityInput.value = '0.0771'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toContainEqual({ actionCode: 'CLIG3', quantity: 0.25, unit: 'ha' })
  })

  // Typing doesn't fire a request at all - only leaving the field does, so
  // rapid successive keystrokes never trigger more than the one refresh
  // that happens on blur.
  it('sends a non-quantity action its live availableArea from the previous response, not its original total', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 },
      { code: 'CLIG3', availableArea: { value: 0.3271, unit: 'ha' } }
    ])
    initSelectActionsPage(form)

    const csam3QuantityInput = form.querySelector('#landActionQuantity_CSAM3')
    csam3QuantityInput.value = '0.1'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availableArea: { value: 0.2271, unit: 'ha' } },
        { code: 'CLIG3', availableArea: { value: 0.2271, unit: 'ha' } }
      ]
    })
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    global.fetch = mockApi({ CSAM3: 0.2271, CLIG3: 0.2271 })
    const clig3Checkbox = form.querySelector('#landAction-CLIG3')
    clig3Checkbox.checked = true
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toContainEqual({
      actionCode: 'CLIG3',
      quantity: 0.2271,
      unit: 'ha'
    })
  })

  it('does not fire a request while typing, only once the field is blurred', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '1'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.value = '2'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.value = '3'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    expect(global.fetch).not.toHaveBeenCalled()

    quantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toEqual([{ actionCode: 'CSAM3', quantity: 3, unit: 'ha' }])
  })

  it("shows the triggering action's own refresh banner while a blur-triggered refresh is in flight, hiding it once it resolves, and never shows another action's banner", async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'UPL1', checked: true, availableArea: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()

    let resolveFetch
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve({ ok: true, json: () => Promise.resolve({ actions: [] }) })
        })
    )
    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '5'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    const csam3Banner = document.getElementById('landActionQuantity_CSAM3-refresh-banner')
    const upl1Banner = document.getElementById('landActionQuantity_UPL1-refresh-banner')
    expect(csam3Banner.classList.contains('select-actions-refresh-banner--hidden')).toBe(false)
    expect(upl1Banner.classList.contains('select-actions-refresh-banner--hidden')).toBe(true)

    const upl1Checkbox = form.querySelector('#landAction-UPL1')
    expect(quantityInput.disabled).toBe(false)
    expect(upl1Checkbox.disabled).toBe(true)
    expect(form.querySelector('#landActionQuantity_UPL1').disabled).toBe(true)

    resolveFetch()
    await flushPromises()

    expect(csam3Banner.classList.contains('select-actions-refresh-banner--hidden')).toBe(true)
  })

  it('shows a lazily-created refresh banner on the checked/unchecked non-quantity action, removing it once the refresh resolves, and never on a different action', async () => {
    const form = setupDom([
      { code: 'CMOR1', availableArea: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availableArea: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }
    ])
    // 0 headroom beyond CMOR1's own claim (self-competing, realistic) - not
    // the same static 10 echoed back, which would read as fresh surplus and
    // trigger a growth follow-up this test never resolves.
    let resolveFetch
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = () =>
            resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  actions: [
                    { code: 'CMOR1', availableArea: { value: 0, unit: 'ha' } },
                    { code: 'UPL1', availableArea: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }
                  ]
                })
            })
        })
    )
    initSelectActionsPage(form)

    const cmor1Checkbox = form.querySelector('#landAction-CMOR1')
    cmor1Checkbox.checked = true
    cmor1Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const cmor1Item = cmor1Checkbox.closest('.govuk-checkboxes__item')
    expect(cmor1Item.querySelector('.select-actions-refresh-banner')).not.toBeNull()

    const upl1Banner = document.getElementById('landActionQuantity_UPL1-refresh-banner')
    expect(upl1Banner.classList.contains('select-actions-refresh-banner--hidden')).toBe(true)

    const upl1Checkbox = form.querySelector('#landAction-UPL1')
    expect(cmor1Checkbox.disabled).toBe(false)
    expect(upl1Checkbox.disabled).toBe(true)
    expect(form.querySelector('#landActionQuantity_UPL1').disabled).toBe(true)

    resolveFetch()
    await flushPromises()

    expect(cmor1Item.querySelector('.select-actions-refresh-banner')).toBeNull()
    expect(upl1Checkbox.disabled).toBe(false)
  })

  it('keeps the refresh banner visible across a growth follow-up chain, without hiding and re-showing between links', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, chosenArea: 0.2271 },
      { code: 'CLIG3', availableArea: { value: 0.3271, unit: 'ha' } }
    ])
    // First call (triggered by checking CLIG3) reports growth for CMOR1;
    // the automatic follow-up it triggers must not let the banner drop in
    // between - only resolved once both fetches are pending/inspected.
    const pending = []
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve)
        })
    )
    initSelectActionsPage(form)
    await flushPromises()

    const clig3Checkbox = form.querySelector('#landAction-CLIG3')
    const clig3Item = clig3Checkbox.closest('.govuk-checkboxes__item')
    clig3Checkbox.checked = true
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(clig3Item.querySelector('.select-actions-refresh-banner')).not.toBeNull()

    pending.shift()({
      ok: true,
      json: () => Promise.resolve({ actions: [{ code: 'CMOR1', availableArea: { value: 0.1, unit: 'ha' } }] })
    })
    await flushPromises()

    // The growth follow-up's own request is now in flight - banner must
    // still be visible, not toggled off and back on.
    expect(clig3Item.querySelector('.select-actions-refresh-banner')).not.toBeNull()

    pending.shift()({
      ok: true,
      json: () => Promise.resolve({ actions: [{ code: 'CMOR1', availableArea: { value: 0, unit: 'ha' } }] })
    })
    await flushPromises()

    expect(clig3Item.querySelector('.select-actions-refresh-banner')).toBeNull()
  })

  it.each([[''], ['  ']])('does not fire a request when the quantity field is left empty (%j)', async (typedValue) => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = typedValue
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it.each([['0'], ['abc'], ['-1']])(
    'does not fire a request when the typed quantity is invalid but not empty (%j)',
    async (typedValue) => {
      const form = setupDom([
        { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
      ])
      global.fetch = fetchOk({ actions: [] })
      initSelectActionsPage(form)
      await flushPromises()
      global.fetch.mockClear()

      const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
      quantityInput.value = typedValue
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('blur'))
      await flushPromises()

      expect(global.fetch).not.toHaveBeenCalled()
    }
  )

  // An over-max quantity is invalid, same as any other invalid value - no
  // request fires until the user types something within range.
  it('does not fire a request when the typed quantity exceeds the input max', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '25'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does not grey out a different, unchecked action when a checked action is given an over-max quantity', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'CLIG3', availableArea: { value: 45.2, unit: 'ha' } }
    ])
    global.fetch = mockApi({ CSAM3: 18.5, CLIG3: 45.2 })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '25'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(form.querySelector('input[value="CLIG3"]').disabled).toBe(false)
  })

  it('disables and shows a message for an action with 0 available area in the response', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availableArea: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }
    ])
    global.fetch = fetchOk({ actions: [{ code: 'UPL1', availableArea: { value: 0, unit: 'ha' } }] })
    initSelectActionsPage(form)

    const cmor1 = form.querySelector('input[value="CMOR1"]')
    cmor1.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const upl1 = form.querySelector('input[value="UPL1"]')
    expect(upl1.disabled).toBe(true)
    expect(upl1.closest('.govuk-checkboxes__item').textContent).toContain('Not compatible with other selected actions.')
  })

  it('re-enables and clears the message for an action that becomes available again', async () => {
    const form = setupDom([{ code: 'UPL1', availableArea: { value: 0, unit: 'ha' } }])
    const upl1 = form.querySelector('input[value="UPL1"]')
    upl1.disabled = true
    const message = document.createElement('p')
    message.className = 'select-actions-unavailable-message'
    message.textContent = 'Not compatible with other selected actions.'
    upl1.closest('.govuk-checkboxes__item').appendChild(message)

    global.fetch = fetchOk({ actions: [{ code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }] })
    initSelectActionsPage(form)

    upl1.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(upl1.disabled).toBe(false)
    expect(upl1.closest('.govuk-checkboxes__item').querySelector('.select-actions-unavailable-message')).toBeNull()
  })

  it('re-enables an action after unchecking it, even with a leftover typed quantity still in its input', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '2'
      }
    ])
    global.fetch = fetchOk({ actions: [{ code: 'CSAM3', availableArea: { value: 18.5, unit: 'ha' } }] })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3 = form.querySelector('input[value="CSAM3"]')
    csam3.checked = false
    csam3.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(csam3.disabled).toBe(false)
  })

  it('clears the quantity input when its action is unchecked', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '2'
      }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3 = form.querySelector('input[value="CSAM3"]')
    csam3.checked = false
    csam3.dispatchEvent(new Event('change', { bubbles: true }))

    expect(form.querySelector('#landActionQuantity_CSAM3').value).toBe('')
  })

  it('updates the data-available-unit attribute but does not disable a non-quantity action whose area is reduced but still non-zero', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availableArea: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }
    ])
    global.fetch = fetchOk({ actions: [{ code: 'UPL1', availableArea: { value: 2, unit: 'ha' } }] })
    initSelectActionsPage(form)

    form.querySelector('input[value="CMOR1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const upl1 = form.querySelector('input[value="UPL1"]')
    expect(upl1.getAttribute('data-available-unit')).toBe('ha')
    expect(upl1.disabled).toBe(false)
  })

  it('updates the quantity input max and hint from the response for an UNCHECKED quantity-required action', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availableArea: { value: 10, unit: 'ha' } },
      { code: 'CSAM3', availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 12, unit: 'ha' }, requiresMaxQuantity: 12 }]
    })
    initSelectActionsPage(form)

    form.querySelector('input[value="CMOR1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    expect(quantityInput.max).toBe('12')
    expect(document.getElementById('landActionQuantity_CSAM3-hint').textContent).toBe('12 hectares available')
  })

  it('checking an action with no quantity typed yet leaves its own hint/max at the un-competed full total (nothing confirmed yet to send)', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    global.fetch = mockApi({ CSAM3: 18.5 })
    initSelectActionsPage(form)

    form.querySelector('input[value="CSAM3"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    // No request fires at all (nothing confirmed to send yet, per the
    // checkbox-change guard) - the hint is untouched, still whatever the
    // initial fixture/server-rendered markup set it to.
    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    expect(quantityInput.max).toBe('18.5')
    expect(document.getElementById('landActionQuantity_CSAM3-hint').textContent).toBe('18.5 ha available')
  })

  it('hides the conditional reveal panel when a quantity-required action is disabled', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availableArea: { value: 10, unit: 'ha' } },
      { code: 'CSAM3', availableArea: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    initSelectActionsPage(form)

    form.querySelector('input[value="CMOR1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const csam3 = form.querySelector('input[value="CSAM3"]')
    expect(csam3.disabled).toBe(true)
    expect(isConditionalHidden(csam3)).toBe(true)
  })

  // Never force a conditional panel open - that's the browser's job on click.
  it('does not force an unchecked action back open when it becomes available again', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availableArea: { value: 10, unit: 'ha' } },
      { code: 'CSAM3', availableArea: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }
    ])
    const csam3 = form.querySelector('input[value="CSAM3"]')
    const conditionalId = csam3.getAttribute('aria-controls')
    document.getElementById(conditionalId).classList.add('govuk-checkboxes__conditional--hidden')
    csam3.disabled = true

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }]
    })
    initSelectActionsPage(form)

    form.querySelector('input[value="CMOR1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(csam3.disabled).toBe(false)
    expect(isConditionalHidden(csam3)).toBe(true)
  })

  it('does not re-open the conditional panel after unchecking an action while a refresh is in flight', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 5, unit: 'ha' },
        requiresMaxQuantity: 5,
        quantityValue: '2'
      }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availableArea: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }]
    })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3 = form.querySelector('input[value="CSAM3"]')
    const conditionalId = csam3.getAttribute('aria-controls')
    csam3.checked = false
    // Simulate the browser's native click handling closing the panel
    // synchronously, before our async change handler's refresh resolves.
    document.getElementById(conditionalId).classList.add('govuk-checkboxes__conditional--hidden')
    csam3.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(isConditionalHidden(csam3)).toBe(true)
  })

  it('never disables a checked action from its own self-competing 0 response', async () => {
    const form = setupDom([
      {
        code: 'CLIG3',
        checked: true,
        availableArea: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.3271'
      }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CLIG3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    initSelectActionsPage(form)

    form.querySelector('input[value="CLIG3"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const clig3 = form.querySelector('input[value="CLIG3"]')
    const quantityInput = form.querySelector('#landActionQuantity_CLIG3')
    expect(clig3.disabled).toBe(false)
    expect(quantityInput.disabled).toBe(false)
    expect(document.getElementById('landActionQuantity_CLIG3-hint').textContent).toBe('0 hectares available')
  })

  it('refreshes the hint to the raw response value after a refresh, not the typed value plus it', async () => {
    const form = setupDom([
      {
        code: 'CLIG3',
        checked: true,
        availableArea: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.1'
      }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CLIG3', availableArea: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 }]
    })
    initSelectActionsPage(form)

    form.querySelector('input[value="CLIG3"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(document.getElementById('landActionQuantity_CLIG3-hint').textContent).toBe('0.2271 hectares available')
  })

  // Full sequence from the algorithm this page implements: CSAM3=0.10, then
  // CLIG3 checked, then CMOR1 checked - each non-quantity action's chosen
  // area is established from what it actually claimed, not the response.
  it("establishes each non-quantity action's chosen area from its own claim as it is checked", async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.10'
      },
      { code: 'CLIG3', availableArea: { value: 0.3271, unit: 'ha' } },
      { code: 'CMOR1', availableArea: { value: 0.0301, unit: 'ha' } }
    ])
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availableArea: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 },
        { code: 'CLIG3', availableArea: { value: 0.2271, unit: 'ha' } },
        { code: 'CMOR1', availableArea: { value: 0.0301, unit: 'ha' } }
      ]
    })
    initSelectActionsPage(form)
    await flushPromises()

    const clig3Checkbox = form.querySelector('#landAction-CLIG3')
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availableArea: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 },
        { code: 'CLIG3', availableArea: { value: 0, unit: 'ha' } },
        { code: 'CMOR1', availableArea: { value: 0.0301, unit: 'ha' } }
      ]
    })
    clig3Checkbox.checked = true
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(getChosenAreaFieldValue(clig3Checkbox)).toBe('0.2271')

    const cmor1Checkbox = form.querySelector('#landAction-CMOR1')
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availableArea: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 },
        { code: 'CLIG3', availableArea: { value: 0, unit: 'ha' } },
        { code: 'CMOR1', availableArea: { value: 0, unit: 'ha' } }
      ]
    })
    cmor1Checkbox.checked = true
    cmor1Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(getChosenAreaFieldValue(cmor1Checkbox)).toBe('0.0301')
  })

  it('grows only the first checked non-quantity action per response, leaving others flat until a follow-up confirms what remains', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.10'
      },
      { code: 'CLIG3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, chosenArea: 0.2271 },
      { code: 'CMOR1', checked: true, availableArea: { value: 0.0301, unit: 'ha' }, chosenArea: 0.0301 }
    ])
    // Self-competing on load (everything checked, nothing freed yet) reports
    // no surplus for either non-quantity action.
    global.fetch = mockApi({ CLIG3: 0.2271, CMOR1: 0.0301 })
    initSelectActionsPage(form)
    await flushPromises()

    // Unchecking CSAM3 frees up 0.1ha - only ONE non-quantity action may grow
    // per response (see applyRefreshResponse), so CLIG3 (first in DOM order)
    // claims it in the first pass; the follow-up, sent with CLIG3's now-grown
    // claim, must report nothing left for CMOR1 to also grow into.
    global.fetch = vi.fn().mockImplementation((url, options) => {
      const { plannedActions } = JSON.parse(options.body)
      const clig3Quantity = plannedActions.find((p) => p.actionCode === 'CLIG3')?.quantity ?? 0
      const surplus = clig3Quantity >= 0.3271 ? 0 : 0.1
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            actions: [
              { code: 'CLIG3', availableArea: { value: surplus, unit: 'ha' } },
              { code: 'CMOR1', availableArea: { value: surplus, unit: 'ha' } }
            ]
          })
      })
    })
    const csam3 = form.querySelector('input[value="CSAM3"]')
    csam3.checked = false
    csam3.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const clig3 = form.querySelector('input[value="CLIG3"]')
    const cmor1 = form.querySelector('input[value="CMOR1"]')
    expect(getChosenAreaFieldValue(clig3)).toBe('0.3271')
    expect(getChosenAreaFieldValue(cmor1)).toBe('0.0301')
  })

  // Reproduces the real bug: releasing a quantity action's claim frees land,
  // and the API reports the SAME freed amount as independently available to
  // BOTH other checked non-quantity actions (a hypothetical per-action
  // figure, not a partition) - only one may actually claim it.
  it('does not double-allocate freed land when the response reports the same surplus for two non-quantity actions at once', async () => {
    const form = setupDom([
      {
        code: 'CMOR3',
        checked: true,
        availableArea: { value: 23.9457, unit: 'ha' },
        requiresMaxQuantity: 23.9457,
        quantityValue: '20'
      },
      { code: 'CLIG3', checked: true, availableArea: { value: 23.9457, unit: 'ha' }, chosenArea: 2.9957 },
      { code: 'CMOR1', checked: true, availableArea: { value: 23.9457, unit: 'ha' }, chosenArea: 0.975 }
    ])
    global.fetch = mockApi({ CLIG3: 2.9957, CMOR1: 0.975 })
    initSelectActionsPage(form)
    await flushPromises()

    // Unchecking CMOR3 frees 20ha - the response reports it as available to
    // EACH of CLIG3/CMOR1 independently (as the real API does), but only
    // CLIG3 (first in DOM order) may claim it in this pass.
    global.fetch = vi.fn().mockImplementation((url, options) => {
      const { plannedActions } = JSON.parse(options.body)
      const clig3Quantity = plannedActions.find((p) => p.actionCode === 'CLIG3')?.quantity ?? 0
      const stillFree = clig3Quantity < 22.9957
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            actions: [
              { code: 'CLIG3', availableArea: { value: stillFree ? 20 : 0, unit: 'ha' } },
              { code: 'CMOR1', availableArea: { value: stillFree ? 20 : 0, unit: 'ha' } }
            ]
          })
      })
    })
    const cmor3 = form.querySelector('input[value="CMOR3"]')
    cmor3.checked = false
    cmor3.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const clig3 = form.querySelector('input[value="CLIG3"]')
    const cmor1 = form.querySelector('input[value="CMOR1"]')
    expect(getChosenAreaFieldValue(clig3)).toBe('22.9957')
    expect(getChosenAreaFieldValue(cmor1)).toBe('0.975')
  })

  // Same single response that grows CLIG3/CMOR1 also reports CSAM3's own
  // (now zero) availability, since the backend recomputes every action
  // against the SAME plannedActions in one call - no second fetch needed.
  it('disables an unchecked quantity action and updates its hint to zero in the same response that lets other actions absorb its freed land', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 22.9957, unit: 'ha' },
        requiresMaxQuantity: 22.9957,
        quantityValue: '20'
      },
      { code: 'CLIG3', checked: true, availableArea: { value: 22.9957, unit: 'ha' }, chosenArea: 2.9957 }
    ])
    global.fetch = mockApi({ CLIG3: 2.9957 })
    initSelectActionsPage(form)
    await flushPromises()

    // The first response is only accurate for the plannedActions it was
    // given (CLIG3=2.9957, i.e. before it grows) - CLIG3 growing to
    // 22.9957 makes CSAM3's "20 left" figure stale, so the follow-up
    // refresh (sent with CLIG3's new, grown claim) must report CSAM3's
    // true, now-zero availability.
    global.fetch = vi.fn().mockImplementation((url, options) => {
      const { plannedActions } = JSON.parse(options.body)
      const clig3Quantity = plannedActions.find((p) => p.actionCode === 'CLIG3')?.quantity ?? 0
      const csam3Available = clig3Quantity >= 22.9957 ? 0 : 20
      const clig3Available = clig3Quantity >= 22.9957 ? 0 : 20
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            actions: [
              {
                code: 'CSAM3',
                availableArea: { value: csam3Available, unit: 'ha' },
                requiresMaxQuantity: csam3Available
              },
              { code: 'CLIG3', availableArea: { value: clig3Available, unit: 'ha' } }
            ]
          })
      })
    })
    const csam3 = form.querySelector('input[value="CSAM3"]')
    csam3.checked = false
    csam3.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const clig3 = form.querySelector('input[value="CLIG3"]')
    expect(getChosenAreaFieldValue(clig3)).toBe('22.9957')
    expect(csam3.disabled).toBe(true)
    expect(document.getElementById('landActionQuantity_CSAM3-hint').textContent).toBe('0 hectares available')
    expect(csam3.closest('.govuk-checkboxes__item').textContent).toContain(
      'Not compatible with other selected actions.'
    )
  })

  it("sends a non-quantity action's flat chosen area as its claim when it never got a chance to grow", async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availableArea: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.10'
      },
      { code: 'CLIG3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, chosenArea: 0.2271 },
      { code: 'CMOR1', checked: true, availableArea: { value: 0.0301, unit: 'ha' }, chosenArea: 0.0301 }
    ])
    // 0.1ha surplus is only genuinely available once - growth (both the
    // initial checked-on-load refresh and any follow-up it triggers) must
    // see it claimed (0) from the second call onward.
    let surplusCalls = 0
    global.fetch = vi.fn().mockImplementation(() => {
      surplusCalls += 1
      const value = surplusCalls === 1 ? 0.1 : 0
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            actions: [
              { code: 'CLIG3', availableArea: { value, unit: 'ha' } },
              { code: 'CMOR1', availableArea: { value, unit: 'ha' } }
            ]
          })
      })
    })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3 = form.querySelector('input[value="CSAM3"]')
    csam3.checked = false
    csam3.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    // CLIG3 already claimed the only surplus during the initial load's
    // refresh (only one non-quantity action may grow per response) - CMOR1
    // never had anything left to grow into, so it's still at its flat 0.0301.
    global.fetch = mockApi({ CMOR1: 0.0301 })
    const clig3 = form.querySelector('input[value="CLIG3"]')
    clig3.checked = false
    clig3.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toEqual([{ actionCode: 'CMOR1', quantity: 0.0301, unit: 'ha' }])
  })

  it('ignores an out-of-order (stale) response', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availableArea: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }
    ])
    let resolveFirst
    const firstResponse = new Promise((resolve) => {
      resolveFirst = () =>
        resolve({
          ok: true,
          json: () => Promise.resolve({ actions: [{ code: 'UPL1', availableArea: { value: 0, unit: 'ha' } }] })
        })
    })
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ actions: [] }) })
    initSelectActionsPage(form)
    await flushPromises()

    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ actions: [{ code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }] })
        })
      )

    const cmor1 = form.querySelector('input[value="CMOR1"]')
    cmor1.dispatchEvent(new Event('change', { bubbles: true }))
    cmor1.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    resolveFirst()
    await flushPromises()

    const upl1 = form.querySelector('input[value="UPL1"]')
    expect(upl1.disabled).toBe(false)
  })

  it('does nothing when the fetch call fails', async () => {
    const form = setupDom([{ code: 'CMOR1', checked: true, availableArea: { value: 10, unit: 'ha' } }])
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'))
    initSelectActionsPage(form)

    const checkbox = form.querySelector('input[value="CMOR1"]')
    await expect(async () => {
      checkbox.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    }).not.toThrow()
  })

  it('does nothing when the response is not ok', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availableArea: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }
    ])
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    initSelectActionsPage(form)

    form.querySelector('input[value="UPL1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(form.querySelector('input[value="UPL1"]').disabled).toBe(false)
  })

  it('ignores unrelated form input events', async () => {
    const form = setupDom([{ code: 'CMOR1', availableArea: { value: 10, unit: 'ha' } }])
    const other = document.createElement('input')
    other.name = 'crumb'
    form.appendChild(other)
    global.fetch = vi.fn()
    initSelectActionsPage(form)

    other.dispatchEvent(new Event('input', { bubbles: true }))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('keeps other actions disabled continuously across a growth follow-up chain, without a re-enabled gap between links', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, chosenArea: 0.2271 },
      { code: 'CLIG3', availableArea: { value: 0.3271, unit: 'ha' } }
    ])
    // First call (triggered by checking CLIG3) reports growth for CMOR1;
    // applyRefreshResponse re-enables CMOR1 as part of applying that growth,
    // so the follow-up it triggers must re-disable it again before its own
    // fetch starts, not leave a gap until that fetch resolves.
    const pending = []
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve)
        })
    )
    initSelectActionsPage(form)
    await flushPromises()

    const clig3Checkbox = form.querySelector('#landAction-CLIG3')
    const cmor1Checkbox = form.querySelector('#landAction-CMOR1')
    clig3Checkbox.checked = true
    clig3Checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(cmor1Checkbox.disabled).toBe(true)

    pending.shift()({
      ok: true,
      json: () => Promise.resolve({ actions: [{ code: 'CMOR1', availableArea: { value: 0.1, unit: 'ha' } }] })
    })
    await flushPromises()

    // The growth follow-up's own request is now in flight - CMOR1 must
    // still read as disabled, not have flashed back to enabled in between.
    expect(cmor1Checkbox.disabled).toBe(true)

    pending.shift()({
      ok: true,
      json: () => Promise.resolve({ actions: [{ code: 'CMOR1', availableArea: { value: 0, unit: 'ha' } }] })
    })
    await flushPromises()

    expect(cmor1Checkbox.disabled).toBe(false)
  })
})
