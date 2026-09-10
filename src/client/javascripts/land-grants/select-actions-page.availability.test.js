// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSelectActionsPage } from './select-actions-page.js'
import {
  checkbox,
  deferredFetch,
  deferredFetchQueue,
  fetchOk,
  flushPromises,
  hintFor,
  initSettled,
  mockApi,
  quantityInputFor,
  sentPlannedActions,
  setupDom,
  toggle,
  typeQuantity
} from './select-actions-page.test-helpers.js'

describe('initSelectActionsPage - availability', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.history.pushState(null, '', '/select-actions?parcelId=SD7946-0155')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('still fires a request when typing a valid quantity within the latest refreshed max', async () => {
    const form = setupDom([
      { code: 'CLIG3', checked: true, availability: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CLIG3', availability: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 }]
    })
    initSelectActionsPage(form)

    const quantityInput = await typeQuantity(form, 'CLIG3', '0.1')

    expect(quantityInput.max).toBe('0.2271')
    global.fetch.mockClear()

    await typeQuantity(form, 'CLIG3', '0.2')

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('allows reducing a quantity at or below its last-confirmed value even when the displayed max reads 0', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.10'
      },
      { code: 'CLIG3', availability: { value: 0.3271, unit: 'ha' } }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 0.1, unit: 'ha' }, requiresMaxQuantity: 0.1 }]
    })
    initSelectActionsPage(form)
    await flushPromises()

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    await toggle(form, 'CLIG3')

    expect(hintFor('CSAM3').textContent).toBe('0 hectares available')
    global.fetch.mockClear()

    await typeQuantity(form, 'CSAM3', '0.05')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(sentPlannedActions()).toContainEqual({ actionCode: 'CSAM3', quantity: 0.05, unit: 'ha' })
  })

  it('allows increasing a quantity back up after a reduction, up to the static uncompeted total', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.10'
      },
      { code: 'CLIG3', availability: { value: 0.3271, unit: 'ha' } }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 0.1, unit: 'ha' }, requiresMaxQuantity: 0.1 }]
    })
    initSelectActionsPage(form)
    await flushPromises()

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    await toggle(form, 'CLIG3')

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 0.05, unit: 'ha' }, requiresMaxQuantity: 0.05 }]
    })
    await typeQuantity(form, 'CSAM3', '0.05')
    global.fetch.mockClear()

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    await typeQuantity(form, 'CSAM3', '0.10')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(sentPlannedActions()).toContainEqual({ actionCode: 'CSAM3', quantity: 0.1, unit: 'ha' })
  })

  it('still blocks an increase above the static uncompeted total', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.10'
      },
      { code: 'CLIG3', availability: { value: 0.3271, unit: 'ha' } }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 0.1, unit: 'ha' }, requiresMaxQuantity: 0.1 }]
    })
    initSelectActionsPage(form)
    await flushPromises()

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    await toggle(form, 'CLIG3')
    global.fetch.mockClear()

    await typeQuantity(form, 'CSAM3', '0.35')

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reverts an in-progress invalid quantity edit to the last confirmed value instead of losing the selection', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.1'
      },
      { code: 'CLIG3', availability: { value: 0.3271, unit: 'ha' } },
      { code: 'CMOR1', availability: { value: 10, unit: 'ha' } }
    ])

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 }]
    })
    const csam3QuantityInput = quantityInputFor(form, 'CSAM3')
    initSelectActionsPage(form)
    await flushPromises()

    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availability: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 },
        { code: 'CLIG3', availability: { value: 0.2271, unit: 'ha' } }
      ]
    })
    await toggle(form, 'CLIG3')

    // An in-progress edit, never blurred - no refresh fires for this yet.
    csam3QuantityInput.value = '0.4'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))

    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availability: { value: 0.1271, unit: 'ha' }, requiresMaxQuantity: 0.1271 },
        { code: 'CMOR1', availability: { value: 9.8, unit: 'ha' } }
      ]
    })
    await toggle(form, 'CMOR1')

    const csam3Checkbox = checkbox(form, 'CSAM3')
    expect(csam3Checkbox.checked).toBe(true)
    expect(csam3Checkbox.disabled).toBe(false)
    expect(csam3QuantityInput.value).toBe('0.1')

    expect(sentPlannedActions()).toContainEqual({ actionCode: 'CSAM3', quantity: 0.1, unit: 'ha' })
  })

  it('includes a checked action in plannedActions when a different action is being edited', async () => {
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

    await initSettled(form, fetchOk({ actions: [] }))

    await typeQuantity(form, 'CSAM3', '0.0771')

    expect(sentPlannedActions()).toContainEqual({ actionCode: 'CLIG3', quantity: 0.25, unit: 'ha' })
  })

  it('sends a non-quantity action its live availability from the previous response, not its original total', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 0.3271, unit: 'ha' }, requiresMaxQuantity: 0.3271 },
      { code: 'CLIG3', availability: { value: 0.3271, unit: 'ha' } }
    ])
    initSelectActionsPage(form)

    const csam3QuantityInput = quantityInputFor(form, 'CSAM3')
    csam3QuantityInput.value = '0.1'
    csam3QuantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availability: { value: 0.2271, unit: 'ha' } },
        { code: 'CLIG3', availability: { value: 0.2271, unit: 'ha' } }
      ]
    })
    csam3QuantityInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    global.fetch = mockApi({ CSAM3: 0.2271, CLIG3: 0.2271 })
    await toggle(form, 'CLIG3', true)

    expect(sentPlannedActions()).toContainEqual({
      actionCode: 'CLIG3',
      quantity: 0.2271,
      unit: 'ha'
    })
  })

  it('does not fire a request while typing, only once the field is blurred (which flushes any pending debounce immediately)', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'UPL1', availability: { value: 5, unit: 'ha' } }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    const quantityInput = quantityInputFor(form, 'CSAM3')
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
    expect(sentPlannedActions()).toEqual([{ actionCode: 'CSAM3', quantity: 3, unit: 'ha' }])
  })

  it('fires a request 500ms after the user stops typing, without waiting for blur', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'UPL1', availability: { value: 5, unit: 'ha' } }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    const quantityInput = quantityInputFor(form, 'CSAM3')
    quantityInput.value = '1'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.value = '2'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    quantityInput.value = '3'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))

    // Still short of the debounce window - no request yet, field untouched.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(global.fetch).not.toHaveBeenCalled()

    // Past the debounce window from the last keystroke - fires on its own.
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(sentPlannedActions()).toEqual([{ actionCode: 'CSAM3', quantity: 3, unit: 'ha' }])
  })

  it('restarts the 500ms debounce on every keystroke, rather than firing from the first one', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'UPL1', availability: { value: 5, unit: 'ha' } }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    const quantityInput = quantityInputFor(form, 'CSAM3')
    quantityInput.value = '1'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))

    // A keystroke lands just before the first one's window would have
    // elapsed - that must push the deadline out rather than let it fire.
    await new Promise((resolve) => setTimeout(resolve, 400))
    quantityInput.value = '12'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(global.fetch).not.toHaveBeenCalled()

    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(sentPlannedActions()).toEqual([{ actionCode: 'CSAM3', quantity: 12, unit: 'ha' }])
  })

  it("shows the triggering action's own refresh banner while a blur-triggered refresh is in flight, hiding it once it resolves, and never shows another action's banner", async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'UPL1', checked: true, availability: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()

    const fetchMock = deferredFetch()
    global.fetch = fetchMock.mock
    const quantityInput = await typeQuantity(form, 'CSAM3', '5')

    const csam3Banner = document.getElementById('landActionQuantity_CSAM3-refresh-banner')
    const upl1Banner = document.getElementById('landActionQuantity_UPL1-refresh-banner')
    expect(csam3Banner.classList.contains('select-actions-refresh-banner--hidden')).toBe(false)
    expect(upl1Banner.classList.contains('select-actions-refresh-banner--hidden')).toBe(true)

    const upl1Checkbox = checkbox(form, 'UPL1')
    expect(quantityInput.disabled).toBe(false)
    expect(upl1Checkbox.disabled).toBe(true)
    expect(quantityInputFor(form, 'UPL1').disabled).toBe(true)

    fetchMock.resolve({ actions: [] })
    await flushPromises()

    expect(csam3Banner.classList.contains('select-actions-refresh-banner--hidden')).toBe(true)
  })

  it('shows a lazily-created refresh banner on the checked/unchecked non-quantity action, removing it once the refresh resolves, and never on a different action', async () => {
    const form = setupDom([
      { code: 'CMOR1', availability: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availability: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }
    ])
    // 0 headroom beyond CMOR1's own claim (self-competing, realistic) - not
    // the same static 10 echoed back, which would read as fresh surplus and
    // trigger a growth follow-up this test never resolves.
    const fetchMock = deferredFetch()
    global.fetch = fetchMock.mock
    initSelectActionsPage(form)

    await toggle(form, 'CMOR1', true)

    const cmor1Checkbox = checkbox(form, 'CMOR1')
    const cmor1Item = cmor1Checkbox.closest('.govuk-checkboxes__item')
    expect(cmor1Item.querySelector('.select-actions-refresh-banner')).not.toBeNull()

    const upl1Banner = document.getElementById('landActionQuantity_UPL1-refresh-banner')
    expect(upl1Banner.classList.contains('select-actions-refresh-banner--hidden')).toBe(true)

    const upl1Checkbox = checkbox(form, 'UPL1')
    expect(cmor1Checkbox.disabled).toBe(false)
    expect(upl1Checkbox.disabled).toBe(true)
    expect(quantityInputFor(form, 'UPL1').disabled).toBe(true)

    fetchMock.resolve({
      actions: [
        { code: 'CMOR1', availability: { value: 0, unit: 'ha' } },
        { code: 'UPL1', availability: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }
      ]
    })
    await flushPromises()

    expect(cmor1Item.querySelector('.select-actions-refresh-banner')).toBeNull()
    expect(upl1Checkbox.disabled).toBe(false)
  })

  it('keeps the refresh banner visible across a growth follow-up chain, without hiding and re-showing between links', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 0.3271, unit: 'ha' }, chosenArea: 0.2271 },
      { code: 'CLIG3', availability: { value: 0.3271, unit: 'ha' } }
    ])
    // First call (triggered by checking CLIG3) reports growth for CMOR1;
    // the automatic follow-up it triggers must not let the banner drop in
    // between - only resolved once both fetches are pending/inspected.
    const fetchQueue = deferredFetchQueue()
    global.fetch = fetchQueue.mock
    initSelectActionsPage(form)
    await flushPromises()

    const clig3Checkbox = checkbox(form, 'CLIG3')
    const clig3Item = clig3Checkbox.closest('.govuk-checkboxes__item')
    await toggle(form, 'CLIG3', true)

    expect(clig3Item.querySelector('.select-actions-refresh-banner')).not.toBeNull()

    fetchQueue.resolveNext({ actions: [{ code: 'CMOR1', availability: { value: 0.1, unit: 'ha' } }] })
    await flushPromises()

    // The growth follow-up's own request is now in flight - banner must
    // still be visible, not toggled off and back on.
    expect(clig3Item.querySelector('.select-actions-refresh-banner')).not.toBeNull()

    fetchQueue.resolveNext({ actions: [{ code: 'CMOR1', availability: { value: 0, unit: 'ha' } }] })
    await flushPromises()

    expect(clig3Item.querySelector('.select-actions-refresh-banner')).toBeNull()
  })

  it.each([[''], ['  ']])('does not fire a request when the quantity field is left empty (%j)', async (typedValue) => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    const quantityInput = quantityInputFor(form, 'CSAM3')
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
        { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
      ])
      await initSettled(form, fetchOk({ actions: [] }))

      const quantityInput = quantityInputFor(form, 'CSAM3')
      quantityInput.value = typedValue
      quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
      quantityInput.dispatchEvent(new Event('blur'))
      await flushPromises()

      expect(global.fetch).not.toHaveBeenCalled()
    }
  )

  it('does not fire a request when the typed quantity exceeds the input max', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('accepts any typed quantity for an action with no availability restriction', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: null, unit: 'ha' },
        requiresMaxQuantity: true,
        unrestricted: true
      }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    const quantityInput = await typeQuantity(form, 'CSAM3', '9999')

    expect(global.fetch).toHaveBeenCalled()
    // Unrestricted or not, it still claims land that competes with everything
    // else - and the API always gives it a unit, so the claim is sendable.
    expect(sentPlannedActions()).toEqual([{ actionCode: 'CSAM3', quantity: 9999, unit: 'ha' }])
    expect(quantityInput.disabled).toBe(false)
  })

  it('clears the max and hint rather than showing "null" when a refresh reports no restriction', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'CLIG3', availability: { value: 45.2, unit: 'ha' } }
    ])
    await initSettled(
      form,
      fetchOk({
        actions: [
          { code: 'CSAM3', availability: { value: null, unit: 'ha' } },
          { code: 'CLIG3', availability: { value: 45.2, unit: 'ha' } }
        ]
      })
    )

    await toggle(form, 'CLIG3')

    const quantityInput = quantityInputFor(form, 'CSAM3')
    expect(quantityInput.hasAttribute('max')).toBe(false)
    expect(hintFor('CSAM3').textContent).toBe('')
    expect(checkbox(form, 'CSAM3').getAttribute('data-live-available-area')).toBeNull()
  })

  it('does not grey out an unchecked, unrestricted action when a quantity is typed into it', async () => {
    const form = setupDom([
      { code: 'CSAM3', availability: { value: null, unit: 'ha' }, requiresMaxQuantity: true, unrestricted: true },
      { code: 'CLIG3', availability: { value: 45.2, unit: 'ha' } }
    ])
    await initSettled(
      form,
      fetchOk({
        actions: [
          { code: 'CSAM3', availability: { value: null, unit: 'ha' } },
          { code: 'CLIG3', availability: { value: 45.2, unit: 'ha' } }
        ]
      })
    )

    // A typed amount on an unchecked action must not be compared against a null
    // ceiling - that coerces to 0 and rejects anything above zero.
    const quantityInput = quantityInputFor(form, 'CSAM3')
    quantityInput.value = '12'
    quantityInput.dispatchEvent(new Event('input', { bubbles: true }))
    await toggle(form, 'CLIG3')

    expect(global.fetch).toHaveBeenCalled()
    expect(checkbox(form, 'CSAM3').disabled).toBe(false)
    expect(quantityInput.value).toBe('12')
  })

  it('does not grey out a different, unchecked action when a checked action is given an over-max quantity', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 },
      { code: 'CLIG3', availability: { value: 45.2, unit: 'ha' } }
    ])
    await initSettled(form, mockApi({ CSAM3: 18.5, CLIG3: 45.2 }))

    expect(global.fetch).not.toHaveBeenCalled()
    expect(checkbox(form, 'CLIG3').disabled).toBe(false)
  })

  it('disables and shows a message for an action with 0 available area in the response', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availability: { value: 5, unit: 'ha' } }
    ])
    global.fetch = fetchOk({ actions: [{ code: 'UPL1', availability: { value: 0, unit: 'ha' } }] })
    initSelectActionsPage(form)

    const cmor1 = checkbox(form, 'CMOR1')
    cmor1.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const upl1 = checkbox(form, 'UPL1')
    expect(upl1.disabled).toBe(true)
    expect(upl1.closest('.govuk-checkboxes__item').textContent).toContain('Not compatible with other selected actions.')
  })

  it('re-enables and clears the message for an action that becomes available again', async () => {
    const form = setupDom([{ code: 'UPL1', availability: { value: 0, unit: 'ha' } }])
    const upl1 = checkbox(form, 'UPL1')
    upl1.disabled = true
    const message = document.createElement('p')
    message.className = 'select-actions-unavailable-message'
    message.textContent = 'Not compatible with other selected actions.'
    upl1.closest('.govuk-checkboxes__item').appendChild(message)

    global.fetch = fetchOk({ actions: [{ code: 'UPL1', availability: { value: 5, unit: 'ha' } }] })
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
        availability: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '2'
      }
    ])
    global.fetch = fetchOk({ actions: [{ code: 'CSAM3', availability: { value: 18.5, unit: 'ha' } }] })
    initSelectActionsPage(form)
    await flushPromises()

    await toggle(form, 'CSAM3', false)

    expect(checkbox(form, 'CSAM3').disabled).toBe(false)
  })

  it('clears the quantity input when its action is unchecked', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 18.5, unit: 'ha' },
        requiresMaxQuantity: 18.5,
        quantityValue: '2'
      }
    ])
    global.fetch = fetchOk({ actions: [] })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3 = checkbox(form, 'CSAM3')
    csam3.checked = false
    csam3.dispatchEvent(new Event('change', { bubbles: true }))

    expect(quantityInputFor(form, 'CSAM3').value).toBe('')
  })

  it('updates the data-available-unit attribute but does not disable a non-quantity action whose area is reduced but still non-zero', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availability: { value: 5, unit: 'ha' } }
    ])
    global.fetch = fetchOk({ actions: [{ code: 'UPL1', availability: { value: 2, unit: 'ha' } }] })
    initSelectActionsPage(form)

    await toggle(form, 'CMOR1')

    const upl1 = checkbox(form, 'UPL1')
    expect(upl1.getAttribute('data-available-unit')).toBe('ha')
    expect(upl1.disabled).toBe(false)
  })

  it('updates the quantity input max and hint from the response for an UNCHECKED quantity-required action', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'CSAM3', availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 12, unit: 'ha' }, requiresMaxQuantity: 12 }]
    })
    initSelectActionsPage(form)

    await toggle(form, 'CMOR1')

    const quantityInput = quantityInputFor(form, 'CSAM3')
    expect(quantityInput.max).toBe('12')
    expect(hintFor('CSAM3').textContent).toBe('12 hectares available')
  })

  it('checking an action with no quantity typed yet leaves its own hint/max at the un-competed full total (nothing confirmed yet to send)', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 18.5, unit: 'ha' }, requiresMaxQuantity: 18.5 }
    ])
    global.fetch = mockApi({ CSAM3: 18.5 })
    initSelectActionsPage(form)

    await toggle(form, 'CSAM3')

    // No request fires at all (nothing confirmed to send yet, per the
    // checkbox-change guard) - the hint is untouched, still whatever the
    // initial fixture/server-rendered markup set it to.
    const quantityInput = quantityInputFor(form, 'CSAM3')
    expect(quantityInput.max).toBe('18.5')
    expect(hintFor('CSAM3').textContent).toBe('18.5 ha available')
  })
})
