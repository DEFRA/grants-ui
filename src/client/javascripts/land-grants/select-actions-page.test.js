// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSelectActionsPage } from './select-actions-page.js'

function checkboxItemHtml({ code, checked = false, availableArea, requiresMaxQuantity, quantityValue = '' }) {
  const unitAttr = availableArea ? ` data-available-unit="${availableArea.unit}"` : ''
  const totalAreaAttr = availableArea ? ` data-total-available-area="${availableArea.value}"` : ''
  const quantityInput = requiresMaxQuantity
    ? `
      <div class="govuk-checkboxes__conditional">
        <div class="govuk-form-group">
          <input id="landActionQuantity_${code}" name="landActionQuantity_${code}" type="text" value="${quantityValue}" max="${requiresMaxQuantity}">
          <div id="landActionQuantity_${code}-hint">${requiresMaxQuantity} ha available</div>
          <div class="govuk-input__suffix">ha</div>
        </div>
      </div>`
    : ''
  return `
    <div class="govuk-checkboxes__item">
      <input class="govuk-checkboxes__input" id="landAction-${code}" name="landAction" type="checkbox" value="${code}"${checked ? ' checked' : ''}${unitAttr}${totalAreaAttr}>
      <label for="landAction-${code}">${code}</label>
      ${quantityInput}
    </div>`
}

function setupDom(items) {
  document.body.innerHTML = `
    <form method="post">
      <input type="hidden" name="crumb" value="test-crumb-value">
      <div class="govuk-checkboxes" data-module="govuk-checkboxes">
        ${items.map(checkboxItemHtml).join('\n')}
      </div>
    </form>`
  return document.querySelector('form')
}

/**
 * Simulates the real land-grants API: an action's availableArea is reduced to
 * 0 whenever this request's plannedActions contains a DIFFERENT action code
 * (i.e. it's competing for the same land) - regardless of whether the action
 * itself is present in plannedActions, matching the API's actual behaviour of
 * applying the same plannedActions list to every action's calculation with no
 * per-target self-exclusion. Good enough to catch a regression back to
 * sending an action's own claim against itself.
 */
function mockApi(baseAreasByCode) {
  return vi.fn().mockImplementation((url, options) => {
    const { plannedActions } = JSON.parse(options.body)
    const competingCodes = new Set(plannedActions.map((p) => p.actionCode))
    const actions = Object.entries(baseAreasByCode).map(([code, value]) => ({
      code,
      availableArea: {
        value: [...competingCodes].some((c) => c !== code) ? 0 : value,
        unit: 'ha'
      }
    }))
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ actions }) })
  })
}

function fetchOk(body) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
}

// A macrotask boundary reliably drains any depth of pending microtasks
// (fetch → .then → Promise.all → async continuation → .json → ...), so
// tests don't need to guess how many `await Promise.resolve()` hops deep
// the refresh's promise chain currently is.
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

  it('does not run an initial refresh on load when nothing is checked', () => {
    const form = setupDom([{ code: 'CLIG3', availableArea: { value: 45.2, unit: 'ha' } }])
    global.fetch = vi.fn()

    initSelectActionsPage(form)

    expect(global.fetch).not.toHaveBeenCalled()
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

  // Regression: checking CLIG3 alone must still surface CLIG3's competition
  // against OTHER actions (e.g. CSAM3), even though CLIG3 is the only thing
  // checked. This requires the request to include CLIG3's own claim (not
  // exclude it), since excluding it would mean no request ever tells CSAM3
  // that CLIG3 is competing with it.
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

  // Regression: a non-zero but reduced availableArea must still disable an
  // action with no quantity input, since it always needs its FULL original
  // area - there's no partial-amount option for it to fall back to. Only
  // checking for a hard 0 missed this: 0.2271 remaining is still "some"
  // area, but CLIG3 originally needed all 0.3271, so it's no longer usable.
  it('greys out a non-quantity action whose reduced (but non-zero) availableArea no longer covers what it needs', async () => {
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

    expect(form.querySelector('input[value="CLIG3"]').disabled).toBe(true)
  })

  // Regression: a quantity-required action that's checked but hasn't had a
  // quantity typed yet must only need SOME area left (> 0), not its full
  // original total - unlike a non-quantity action, it hasn't committed to
  // needing the whole thing. A competing claim reducing its available area
  // to a smaller but still non-zero number must not disable it.
  it('does not grey out a checked-but-unconfirmed quantity-required action whose availableArea is reduced but still non-zero', async () => {
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

    expect(form.querySelector('input[value="CSAM3"]').disabled).toBe(false)
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
        quantityValue: '18.5'
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
    vi.useFakeTimers()
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toEqual([{ actionCode: 'CSAM3', quantity: 3.25, unit: 'ha' }])
  })

  // A quantity-required action's own hint updates instantly as the user
  // types (total minus typed, computed client-side - no API wait), so
  // there's no gap where typing 0 leaves no way of knowing what the total
  // was. The debounced backend response overwrites it again once it lands.
  it("updates a quantity input's own hint instantly (total minus typed) as the user types", () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 }
    ])
    global.fetch = vi.fn()
    initSelectActionsPage(form)

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '0.2'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))

    expect(document.getElementById('landActionQuantity_CSAM3-hint').textContent).toBe('0.1271 hectares available')
  })

  it("resets a quantity input's own hint back to the full total when cleared back to empty/0", () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 }
    ])
    global.fetch = vi.fn()
    initSelectActionsPage(form)

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '0.2'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.value = '0'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))

    expect(document.getElementById('landActionQuantity_CSAM3-hint').textContent).toBe('0.3271 hectares available')
  })

  it("floors a quantity input's own live hint at 0 rather than going negative", () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 0.0771, unit: 'ha' }, requiresMaxQuantity: 0.0771 }
    ])
    global.fetch = vi.fn()
    initSelectActionsPage(form)

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '0.25'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))

    expect(document.getElementById('landActionQuantity_CSAM3-hint').textContent).toBe('0 hectares available')
  })

  // A checkbox-triggered refresh (elsewhere on the form) reads the DOM as-is,
  // bypassing the input-event guard - a stale over-limit value already
  // sitting in CSAM3's field is a confirmed over-claim, so it's sent as
  // needing its full available area (the worst case), not dropped - dropping
  // it would hide the conflict from UPL1's availability check.
  it('sends the full available area for a quantity-required action whose typed quantity exceeds it, on a checkbox-triggered refresh', async () => {
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

    form.querySelector('input[value="UPL1"]').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toContainEqual({
      actionCode: 'CSAM3',
      quantity: 18.5,
      unit: 'ha'
    })
  })

  // Regression: after typing the full max (so the response's own
  // self-competing number reduces the input's `max` attribute towards 0,
  // per applyAvailability applying the API's response as-is), typing a
  // SMALLER, still-valid quantity must still fire a request rather than
  // being blocked as "already known invalid" against that stale live max.
  it('still fires a request when typing a smaller valid quantity after a previous refresh reduced the input max to 0', async () => {
    const form = setupDom([
      { code: 'CLIG3', checked: true, availableArea: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CLIG3', availableArea: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    initSelectActionsPage(form)
    vi.useFakeTimers()

    const quantityInput = form.querySelector('#landActionQuantity_CLIG3')
    quantityInput.value = '0.3271'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)

    expect(quantityInput.max).toBe('0')
    global.fetch.mockClear()

    quantityInput.value = '0.25'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  // Regression: a checked action with a genuinely valid quantity must stay
  // in the request when a DIFFERENT action's quantity is typed - it must not
  // be dropped just because it's not the one currently being edited.
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
    vi.useFakeTimers()
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)

    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toContainEqual({ actionCode: 'CLIG3', quantity: 0.25, unit: 'ha' })
  })

  it('debounces quantity input changes', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'UPL1', availableArea: { value: 5, unit: 'ha' } }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()
    vi.useFakeTimers()

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '1'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(200)
    quantityInput.value = '2'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(200)
    quantityInput.value = '3'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toEqual([{ actionCode: 'CSAM3', quantity: 3, unit: 'ha' }])
  })

  it.each([[''], ['  ']])('does not fire a request when the quantity field is left empty (%j)', async (typedValue) => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()
    vi.useFakeTimers()

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = typedValue
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)

    expect(global.fetch).not.toHaveBeenCalled()
  })

  // Regression: "0", "abc", "-1" are typed-but-invalid, not "nothing typed" -
  // an invalid claim must still be treated as needing the full available
  // area, otherwise it silently drops out of other actions' conflict checks
  // (see the over-max case above).
  it.each([['0'], ['abc'], ['-1']])(
    'sends the full available area when the typed quantity is invalid but not empty (%j)',
    async (typedValue) => {
      const form = setupDom([
        { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
      ])
      global.fetch = fetchOk({ actions: [] })
      initSelectActionsPage(form)
      await flushPromises()
      global.fetch.mockClear()
      vi.useFakeTimers()

      const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
      quantityInput.value = typedValue
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      await vi.advanceTimersByTimeAsync(500)

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [, options] = global.fetch.mock.calls[0]
      expect(JSON.parse(options.body).plannedActions).toEqual([{ actionCode: 'CSAM3', quantity: 18.5, unit: 'ha' }])
    }
  )

  // A quantity over the max is a confirmed over-claim, not "nothing typed" -
  // it must still fire so other actions see CSAM3 competing for its full area.
  it('fires a request with the full available area when the typed quantity exceeds the input max', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()
    vi.useFakeTimers()

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '25'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, options] = global.fetch.mock.calls[0]
    expect(JSON.parse(options.body).plannedActions).toEqual([{ actionCode: 'CSAM3', quantity: 18.5, unit: 'ha' }])
  })

  // Regression: typing an over-max quantity into a checked action must grey
  // out a genuinely competing, unchecked action straight away - the over-claim
  // is treated as needing the full area, so the conflict is never hidden by
  // waiting for the user to check the other box first.
  it('greys out a different, unchecked action as soon as a checked action is given an over-max quantity', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availableArea: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'CLIG3', availableArea: { value: 45.2, unit: 'ha' } }
    ])
    global.fetch = mockApi({ CSAM3: 18.5, CLIG3: 45.2 })
    initSelectActionsPage(form)
    await flushPromises()
    global.fetch.mockClear()
    vi.useFakeTimers()

    const quantityInput = form.querySelector('#landActionQuantity_CSAM3')
    quantityInput.value = '25'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(500)

    expect(form.querySelector('input[value="CLIG3"]').disabled).toBe(true)
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

  // Regression: typing a quantity, then unchecking the action, must not
  // leave it disabled because requiredQuantity() was still reading the
  // leftover typed value from the (now hidden, but not cleared) input as if
  // the action were still checked and needed that exact amount.
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

  it('updates the data-available-unit attribute and disables the checkbox when its area drops below what it needs, for actions without a quantity input', async () => {
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
    expect(upl1.disabled).toBe(true)
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

  // Regression: a selected (checked) action must never be disabled by its
  // own response, even though its hint/max IS updated from it (whatever the
  // API returns) - only OTHER, unselected actions react to a self-competing
  // number by being disabled.
  it('never disables a checked action from its own self-competing response, even when its own hint updates to 0', async () => {
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
})
