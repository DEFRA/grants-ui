// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSelectActionsPage } from './select-actions-page.js'
import {
  checkbox,
  chosenAreaDisplayFor,
  fetchOk,
  flushPromises,
  getChosenAreaFieldValue,
  hintFor,
  initSettled,
  isConditionalHidden,
  mockApi,
  quantityInputFor,
  sentPlannedActions,
  setupDom,
  toggle,
  typeQuantity
} from './select-actions-page.test-helpers.js'

describe('initSelectActionsPage - basics', () => {
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
    const form = setupDom([{ code: 'CMOR1', availability: { value: 10, unit: 'ha' } }])
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
    const form = setupDom([{ code: 'CMOR1', availability: { value: 10, unit: 'ha' } }])
    global.fetch = vi.fn()

    initSelectActionsPage(form)
    form.querySelector('input[type="checkbox"]').dispatchEvent(new Event('change', { bubbles: true }))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('always sends one request with the full, unfiltered plannedActions list', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'UPL1', checked: true, availability: { value: 5, unit: 'ha' } }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    await toggle(form, 'CMOR1')

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
        availability: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '3.25'
      },
      { code: 'CLIG3', availability: { value: 45.2, unit: 'ha' } }
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
          availability: { value: 0.3271, unit: 'ha' },
          requiresMaxQuantity: 0.3271,
          quantityValue: '0.2'
        },
        { code: 'CLIG3', checked: false, availability: { value: 0.3271, unit: 'ha' } }
      ],
      { hasErrors: true }
    )
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availability: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 },
        { code: 'CLIG3', availability: { value: 0, unit: 'ha' } }
      ]
    })

    initSelectActionsPage(form)
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const csam3Checkbox = checkbox(form, 'CSAM3')
    const csam3QuantityInput = quantityInputFor(form, 'CSAM3')
    expect(csam3Checkbox.checked).toBe(true)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(csam3QuantityInput.value).toBe('0.2')

    const clig3Checkbox = checkbox(form, 'CLIG3')
    expect(clig3Checkbox.checked).toBe(false)
    expect(clig3Checkbox.disabled).toBe(true)
  })

  it('updates a non-quantity action hidden field on a fresh interaction after the initial errors-page load settles', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availability: { value: 6.3008, unit: 'ha' },
          requiresMaxQuantity: 6.3008,
          quantityValue: '777',
          hasError: true
        },
        { code: 'CLIG3', checked: true, availability: { value: 6.3008, unit: 'ha' }, chosenArea: 1.3008 }
      ],
      { hasErrors: true }
    )
    global.fetch = fetchOk({ actions: [{ code: 'CLIG3', availability: { value: 1.3008, unit: 'ha' } }] })
    initSelectActionsPage(form)
    await flushPromises()

    await toggle(form, 'CLIG3', false)

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
        json: () => Promise.resolve({ actions: [{ code: 'CLIG3', availability: { value, unit: 'ha' } }] })
      })
    })
    await toggle(form, 'CLIG3', true)

    expect(getChosenAreaFieldValue(checkbox(form, 'CLIG3'))).toBe('6.3008')
    const csam3Checkbox = checkbox(form, 'CSAM3')
    expect(csam3Checkbox.checked).toBe(true)
    expect(quantityInputFor(form, 'CSAM3').value).toBe('777')
  })

  it('re-enables a protected checked action once another action frees up land, without touching its value or error', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availability: { value: 6.3008, unit: 'ha' },
          requiresMaxQuantity: 6.3008,
          quantityValue: '777',
          hasError: true
        },
        { code: 'CLIG3', checked: true, availability: { value: 6.3008, unit: 'ha' }, chosenArea: 1.3008 }
      ],
      { hasErrors: true }
    )
    global.fetch = mockApi({ CSAM3: 0, CLIG3: 1.3008 })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3Checkbox = checkbox(form, 'CSAM3')
    expect(csam3Checkbox.disabled).toBe(false)

    global.fetch = mockApi({ CSAM3: 6.3008, CLIG3: 6.3008 })
    await toggle(form, 'CLIG3', false)

    expect(csam3Checkbox.checked).toBe(true)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(quantityInputFor(form, 'CSAM3').value).toBe('777')
    expect(form.querySelector('.select-actions-unavailable-message')).toBeNull()
  })

  it('keeps a protected action checked when its field is merely focused/blurred (not edited) before another action is unchecked', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availability: { value: 6.3008, unit: 'ha' },
          requiresMaxQuantity: 6.3008,
          quantityValue: '777',
          hasError: true
        },
        { code: 'CLIG3', checked: true, availability: { value: 6.3008, unit: 'ha' }, chosenArea: 1.3008 }
      ],
      { hasErrors: true }
    )
    global.fetch = mockApi({ CSAM3: 0, CLIG3: 1.3008 })
    initSelectActionsPage(form)
    await flushPromises()

    // Clicking a different checkbox first blurs CSAM3's field via focus
    // change, with no edit to its value - must not clear its protection.
    const csam3Input = quantityInputFor(form, 'CSAM3')
    csam3Input.dispatchEvent(new Event('focus'))
    csam3Input.dispatchEvent(new Event('blur'))

    global.fetch = mockApi({ CSAM3: 6.3008, CLIG3: 6.3008 })
    await toggle(form, 'CLIG3', false)

    const csam3Checkbox = checkbox(form, 'CSAM3')
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
          availability: { value: 9, unit: 'ha' },
          requiresMaxQuantity: 9,
          quantityValue: '2',
          hasError: true
        },
        { code: 'CLIG3', checked: true, availability: { value: 9, unit: 'ha' }, chosenArea: 2.3161 }
      ],
      { hasErrors: true }
    )
    global.fetch = mockApi({ CSAM3: 0, CLIG3: 2.3161 })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3Checkbox = checkbox(form, 'CSAM3')
    const csam3Input = quantityInputFor(form, 'CSAM3')
    expect(csam3Checkbox.disabled).toBe(false)

    // A genuine edit clears CSAM3's own protection.
    csam3Input.dispatchEvent(new Event('focus'))
    csam3Input.value = '9999'
    csam3Input.dispatchEvent(new Event('input', { bubbles: true }))
    csam3Input.dispatchEvent(new Event('blur'))

    global.fetch = mockApi({ CSAM3: 9, CLIG3: 9 })
    await toggle(form, 'CLIG3', false)

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
          availability: { value: 9, unit: 'ha' },
          requiresMaxQuantity: 9,
          quantityValue: '33',
          hasError: true
        },
        { code: 'CLIG3', checked: false, availability: { value: 9, unit: 'ha' } }
      ],
      { hasErrors: true }
    )
    global.fetch = mockApi({ CSAM3: 9 })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3Checkbox = checkbox(form, 'CSAM3')
    const csam3Input = quantityInputFor(form, 'CSAM3')

    global.fetch = mockApi({ CSAM3: 9, CLIG3: 9 })
    await toggle(form, 'CLIG3', true)

    csam3Input.dispatchEvent(new Event('focus'))
    csam3Input.value = 'asdhasd'
    csam3Input.dispatchEvent(new Event('input', { bubbles: true }))
    csam3Input.dispatchEvent(new Event('blur'))

    global.fetch = mockApi({ CSAM3: 9, CLIG3: 9 })
    await toggle(form, 'CLIG3', false)

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
          availability: { value: 0.3271, unit: 'ha' },
          requiresMaxQuantity: 0.3271,
          quantityValue: '0.2'
        },
        { code: 'CLIG3', checked: false, availability: { value: 0.3271, unit: 'ha' } },
        { code: 'CMOR1', availability: { value: 10, unit: 'ha' } }
      ],
      { hasErrors: true }
    )
    await initSettled(form, fetchOk({ actions: [] }))

    await toggle(form, 'CMOR1')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(sentPlannedActions()).toContainEqual({ actionCode: 'CSAM3', quantity: 0.2, unit: 'ha' })
  })

  it('never disables, unchecks or resets a checked action whose quantity input already has a validation error', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        // requiresMaxQuantity is lower than quantityValue to simulate a stale server-rendered max.
        requiresMaxQuantity: 0.0271,
        quantityValue: '0.3',
        hasError: true
      },
      { code: 'CLIG3', checked: true, availability: { value: 0.3271, unit: 'ha' }, chosenArea: 0.15 }
    ])
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availability: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 },
        { code: 'CLIG3', availability: { value: 0, unit: 'ha' } }
      ]
    })

    initSelectActionsPage(form)
    await flushPromises()

    const csam3Checkbox = checkbox(form, 'CSAM3')
    const csam3QuantityInput = quantityInputFor(form, 'CSAM3')

    expect(csam3Checkbox.checked).toBe(true)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(csam3QuantityInput.disabled).toBe(false)
    expect(csam3QuantityInput.value).toBe('0.3')
    expect(isConditionalHidden(csam3Checkbox)).toBe(false)
  })

  it('does not run an initial refresh on load when nothing is checked', () => {
    const form = setupDom([{ code: 'CLIG3', availability: { value: 45.2, unit: 'ha' } }])
    global.fetch = vi.fn()

    initSelectActionsPage(form)

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('updates a pre-selected quantity input hint on load to reflect what remains after its own saved value', () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '3.25'
      }
    ])
    global.fetch = vi.fn()

    initSelectActionsPage(form)

    expect(hintFor('CSAM3').textContent).toBe('15.25 hectares available')
  })

  // The route validates crumb in restful mode (X-CSRF-Token header) rather
  // than the default payload-field mode, so a fetch() call never trips
  // @hapi/crumb's autoGenerate into silently rotating the cookie and
  // invalidating the crumb already embedded in the page's hidden form field.
  it('sends the crumb from the hidden form field as the X-CSRF-Token header', async () => {
    const form = setupDom([{ code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' } }])
    await initSettled(form, fetchOk({ actions: [] }))

    await toggle(form, 'CMOR1')

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-CSRF-Token': 'test-crumb-value' })
      })
    )
  })

  it('does not fire a request when checking a quantity-required action with no quantity typed yet', async () => {
    const form = setupDom([
      { code: 'CSAM3', availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'CLIG3', availability: { value: 45.2, unit: 'ha' } }
    ])
    global.fetch = vi.fn()
    initSelectActionsPage(form)

    await toggle(form, 'CSAM3', true)

    expect(global.fetch).not.toHaveBeenCalled()
    // Nothing has been confirmed yet, so CLIG3 must not be greyed out just
    // because CSAM3's box is checked.
    expect(checkbox(form, 'CLIG3').disabled).toBe(false)
  })

  it('greys out a different, unchecked action genuinely made unavailable by the one checked action', async () => {
    const form = setupDom([
      { code: 'CLIG3', checked: true, availability: { value: 45.2, unit: 'ha' } },
      { code: 'CSAM3', availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    await initSettled(form, mockApi({ CLIG3: 45.2, CSAM3: 18.5 }))

    await toggle(form, 'CLIG3')

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/land-grants/actions/SD7946-0155',
      expect.objectContaining({
        body: JSON.stringify({ plannedActions: [{ actionCode: 'CLIG3', quantity: 45.2, unit: 'ha' }] })
      })
    )
    const clig3 = checkbox(form, 'CLIG3')
    const csam3 = checkbox(form, 'CSAM3')
    expect(clig3.disabled).toBe(false)
    expect(csam3.disabled).toBe(true)
  })

  it("updates a non-quantity action's hint from the response without greying it out when it is still non-zero", async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.1'
      },
      { code: 'CLIG3', availability: { value: 0.3271, unit: 'ha' } }
    ])
    await initSettled(form, fetchOk({ actions: [{ code: 'CLIG3', availability: { value: 0.2271, unit: 'ha' } }] }))

    await toggle(form, 'CSAM3')

    expect(checkbox(form, 'CLIG3').disabled).toBe(false)
    expect(hintFor('CLIG3').textContent).toBe('0.2271 hectares available')
  })

  it('reports what a selected total action applied, and that nothing is left for it', async () => {
    const form = setupDom([
      { code: 'CLIG3', availability: { value: 31.89, unit: 'ha' } },
      { code: 'CSAM3', availability: { value: 31.89, unit: 'ha' }, requiresMaxQuantity: 31.89 }
    ])
    await initSettled(form, mockApi({ CLIG3: 31.89, CSAM3: 31.89 }))

    await toggle(form, 'CLIG3', true)

    expect(getChosenAreaFieldValue(checkbox(form, 'CLIG3'))).toBe('31.89')
    expect(chosenAreaDisplayFor('CLIG3').textContent).toBe('31.8900 hectares')
    expect(hintFor('CLIG3').textContent).toBe('0.0000 hectares available')
  })

  it('grows a selected total action into freed land and still reports nothing left for it', async () => {
    const form = setupDom([{ code: 'CLIG3', checked: true, availability: { value: 9.5, unit: 'ha' } }])
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ actions: [{ code: 'CLIG3', availability: { value: 2.5, unit: 'ha' } }] })
      })
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ actions: [{ code: 'CLIG3', availability: { value: 0, unit: 'ha' } }] })
      })
    initSelectActionsPage(form)
    await flushPromises()

    expect(getChosenAreaFieldValue(checkbox(form, 'CLIG3'))).toBe('12')
    expect(chosenAreaDisplayFor('CLIG3').textContent).toBe('12.0000 hectares')
    expect(hintFor('CLIG3').textContent).toBe('0.0000 hectares available')
  })

  it('reverts a total action to what it would claim again once it is deselected', async () => {
    const form = setupDom([{ code: 'CLIG3', checked: true, availability: { value: 31.89, unit: 'ha' } }])
    await initSettled(form, fetchOk({ actions: [{ code: 'CLIG3', availability: { value: 31.89, unit: 'ha' } }] }))

    await toggle(form, 'CLIG3', false)
    expect(getChosenAreaFieldValue(checkbox(form, 'CLIG3'))).toBe('0')

    expect(hintFor('CLIG3').textContent).toBe('31.8900 hectares available')
    expect(chosenAreaDisplayFor('CLIG3').textContent).toBe('31.8900 hectares')
  })

  it('unchecks and clears a checked quantity-required action that has no confirmed quantity, without disabling it', async () => {
    const form = setupDom([
      {
        code: 'CLIG3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.25'
      },
      { code: 'CSAM3', checked: true, availability: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 }
    ])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actions: [{ code: 'CSAM3', availability: { value: 0.0771, unit: 'ha' }, requiresMaxQuantity: 0.0771 }]
        })
    })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3 = checkbox(form, 'CSAM3')
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
        availability: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '13.5'
      },
      { code: 'UPL1', checked: true, availability: { value: 5, unit: 'ha' } }
    ])
    await initSettled(form, mockApi({ CSAM3: 18.5, UPL1: 5 }))

    await toggle(form, 'UPL1')

    const csam3 = checkbox(form, 'CSAM3')
    const upl1 = checkbox(form, 'UPL1')
    expect(csam3.disabled).toBe(false)
    expect(upl1.disabled).toBe(false)
  })

  // Two NON-competing actions: only CSAM3's own claim would ever make CSAM3's
  // area drop, and self-exclusion means that never happens - so UPL1 being
  // checked (a genuinely unrelated action) must not affect CSAM3 at all.
  it('does not grey out an action that a different, non-competing action does not affect', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'UPL1', checked: true, availability: { value: 5, unit: 'ha' } }
    ])
    await initSettled(
      form,
      fetchOk({
        actions: [
          { code: 'CSAM3', availability: { value: 18.5, unit: 'ha' } },
          { code: 'UPL1', availability: { value: 5, unit: 'ha' } }
        ]
      })
    )

    await toggle(form, 'UPL1')

    const csam3 = checkbox(form, 'CSAM3')
    const upl1 = checkbox(form, 'UPL1')
    expect(csam3.disabled).toBe(false)
    expect(upl1.disabled).toBe(false)
  })

  it('resets every action back to its unconstrained availability when nothing is checked', async () => {
    const form = setupDom([{ code: 'UPL1', availability: { value: 5, unit: 'ha' } }])
    const upl1 = checkbox(form, 'UPL1')
    upl1.disabled = true

    global.fetch = fetchOk({ actions: [{ code: 'UPL1', availability: { value: 5, unit: 'ha' } }] })
    initSelectActionsPage(form)

    upl1.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(sentPlannedActions()).toEqual([])
  })

  // When the action being edited is checked solo, its own request is NOT
  // self-excluded (see createAvailabilityRefresher's editingActionCode
  // handling) - the typed value must reach the server so it can be validated,
  // even though that specific request's returned number for CSAM3 itself is
  // then self-competing and unusable (the merge step falls back to it only
  // because there's no other request to source a clean number from).
  it('uses the typed quantity value over the full available area when present', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    await typeQuantity(form, 'CSAM3', '3.25')

    expect(sentPlannedActions()).toEqual([{ actionCode: 'CSAM3', quantity: 3.25, unit: 'ha' }])
  })

  // The hint reflects only the server's confirmed response
  // (syncQuantityInputBounds) - recomputing it from what's typed could show a
  // number that turns out wrong once a competing action's claim is factored in.
  it("does not change a quantity input's own hint as the user types, only after a refresh response", async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 }
    ])
    global.fetch = vi.fn()
    initSelectActionsPage(form)

    const quantityInput = quantityInputFor(form, 'CSAM3')
    const hint = hintFor('CSAM3')
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
        availability: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '25'
      },
      { code: 'UPL1', availability: { value: 5, unit: 'ha' } }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    await toggle(form, 'UPL1', true)

    expect(sentPlannedActions()).toEqual([{ actionCode: 'UPL1', quantity: 5, unit: 'ha' }])
  })
})
