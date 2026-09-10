// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initSelectActionsPage } from './select-actions-page.js'
import {
  checkbox,
  deferredFetch,
  deferredFetchQueue,
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
  submitButton,
  toggle
} from './select-actions-page.test-helpers.js'

describe('initSelectActionsPage - submit', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.history.pushState(null, '', '/select-actions?parcelId=SD7946-0155')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('hides the conditional reveal panel when a quantity-required action is disabled', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'CSAM3', availability: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    initSelectActionsPage(form)

    await toggle(form, 'CMOR1')

    const csam3 = checkbox(form, 'CSAM3')
    expect(csam3.disabled).toBe(true)
    expect(isConditionalHidden(csam3)).toBe(true)
  })

  // Never force a conditional panel open - that's the browser's job on click.
  it('does not force an unchecked action back open when it becomes available again', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'CSAM3', availability: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }
    ])
    const csam3 = checkbox(form, 'CSAM3')
    const conditionalId = csam3.getAttribute('aria-controls')
    document.getElementById(conditionalId).classList.add('govuk-checkboxes__conditional--hidden')
    csam3.disabled = true

    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }]
    })
    initSelectActionsPage(form)

    await toggle(form, 'CMOR1')

    expect(csam3.disabled).toBe(false)
    expect(isConditionalHidden(csam3)).toBe(true)
  })

  it('does not re-open the conditional panel after unchecking an action while a refresh is in flight', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 5, unit: 'ha' },
        requiresMaxQuantity: 5,
        quantityValue: '2'
      }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CSAM3', availability: { value: 5, unit: 'ha' }, requiresMaxQuantity: 5 }]
    })
    initSelectActionsPage(form)
    await flushPromises()

    const csam3 = checkbox(form, 'CSAM3')
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
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.3271'
      }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CLIG3', availability: { value: 0, unit: 'ha' }, requiresMaxQuantity: 0 }]
    })
    initSelectActionsPage(form)

    await toggle(form, 'CLIG3')

    const clig3 = checkbox(form, 'CLIG3')
    const quantityInput = quantityInputFor(form, 'CLIG3')
    expect(clig3.disabled).toBe(false)
    expect(quantityInput.disabled).toBe(false)
    expect(hintFor('CLIG3').textContent).toBe('0 hectares available')
  })

  it('refreshes the hint to the raw response value after a refresh, not the typed value plus it', async () => {
    const form = setupDom([
      {
        code: 'CLIG3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.1'
      }
    ])
    global.fetch = fetchOk({
      actions: [{ code: 'CLIG3', availability: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 }]
    })
    initSelectActionsPage(form)

    await toggle(form, 'CLIG3')

    expect(hintFor('CLIG3').textContent).toBe('0.2271 hectares available')
  })

  // Full sequence from the algorithm this page implements: CSAM3=0.10, then
  // CLIG3 checked, then CMOR1 checked - each non-quantity action's chosen
  // area is established from what it actually claimed, not the response.
  it("establishes each non-quantity action's chosen area from its own claim as it is checked", async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.10'
      },
      { code: 'CLIG3', availability: { value: 0.3271, unit: 'ha' } },
      { code: 'CMOR1', availability: { value: 0.0301, unit: 'ha' } }
    ])
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availability: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 },
        { code: 'CLIG3', availability: { value: 0.2271, unit: 'ha' } },
        { code: 'CMOR1', availability: { value: 0.0301, unit: 'ha' } }
      ]
    })
    initSelectActionsPage(form)
    await flushPromises()

    const clig3Checkbox = checkbox(form, 'CLIG3')
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availability: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 },
        { code: 'CLIG3', availability: { value: 0, unit: 'ha' } },
        { code: 'CMOR1', availability: { value: 0.0301, unit: 'ha' } }
      ]
    })
    await toggle(form, 'CLIG3', true)

    expect(getChosenAreaFieldValue(clig3Checkbox)).toBe('0.2271')

    const cmor1Checkbox = checkbox(form, 'CMOR1')
    global.fetch = fetchOk({
      actions: [
        { code: 'CSAM3', availability: { value: 0.2271, unit: 'ha' }, requiresMaxQuantity: 0.2271 },
        { code: 'CLIG3', availability: { value: 0, unit: 'ha' } },
        { code: 'CMOR1', availability: { value: 0, unit: 'ha' } }
      ]
    })
    await toggle(form, 'CMOR1', true)

    expect(getChosenAreaFieldValue(cmor1Checkbox)).toBe('0.0301')
  })

  it('grows only the first checked non-quantity action per response, leaving others flat until a follow-up confirms what remains', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.10'
      },
      { code: 'CLIG3', checked: true, availability: { value: 0.3271, unit: 'ha' }, chosenArea: 0.2271 },
      { code: 'CMOR1', checked: true, availability: { value: 0.0301, unit: 'ha' }, chosenArea: 0.0301 }
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
              { code: 'CLIG3', availability: { value: surplus, unit: 'ha' } },
              { code: 'CMOR1', availability: { value: surplus, unit: 'ha' } }
            ]
          })
      })
    })
    await toggle(form, 'CSAM3', false)

    const clig3 = checkbox(form, 'CLIG3')
    const cmor1 = checkbox(form, 'CMOR1')
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
        availability: { value: 23.9457, unit: 'ha' },
        requiresMaxQuantity: 23.9457,
        quantityValue: '20'
      },
      { code: 'CLIG3', checked: true, availability: { value: 23.9457, unit: 'ha' }, chosenArea: 2.9957 },
      { code: 'CMOR1', checked: true, availability: { value: 23.9457, unit: 'ha' }, chosenArea: 0.975 }
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
              { code: 'CLIG3', availability: { value: stillFree ? 20 : 0, unit: 'ha' } },
              { code: 'CMOR1', availability: { value: stillFree ? 20 : 0, unit: 'ha' } }
            ]
          })
      })
    })
    await toggle(form, 'CMOR3', false)

    const clig3 = checkbox(form, 'CLIG3')
    const cmor1 = checkbox(form, 'CMOR1')
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
        availability: { value: 22.9957, unit: 'ha' },
        requiresMaxQuantity: 22.9957,
        quantityValue: '20'
      },
      { code: 'CLIG3', checked: true, availability: { value: 22.9957, unit: 'ha' }, chosenArea: 2.9957 }
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
                availability: { value: csam3Available, unit: 'ha' },
                requiresMaxQuantity: csam3Available
              },
              { code: 'CLIG3', availability: { value: clig3Available, unit: 'ha' } }
            ]
          })
      })
    })
    await toggle(form, 'CSAM3', false)

    const clig3 = checkbox(form, 'CLIG3')
    const csam3 = checkbox(form, 'CSAM3')
    expect(getChosenAreaFieldValue(clig3)).toBe('22.9957')
    expect(csam3.disabled).toBe(true)
    expect(hintFor('CSAM3').textContent).toBe('0 hectares available')
    expect(csam3.closest('.govuk-checkboxes__item').textContent).toContain(
      'Not compatible with other selected actions.'
    )
  })

  it("sends a non-quantity action's flat chosen area as its claim when it never got a chance to grow", async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 0.3271, unit: 'ha' },
        requiresMaxQuantity: 0.3271,
        quantityValue: '0.10'
      },
      { code: 'CLIG3', checked: true, availability: { value: 0.3271, unit: 'ha' }, chosenArea: 0.2271 },
      { code: 'CMOR1', checked: true, availability: { value: 0.0301, unit: 'ha' }, chosenArea: 0.0301 }
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
              { code: 'CLIG3', availability: { value, unit: 'ha' } },
              { code: 'CMOR1', availability: { value, unit: 'ha' } }
            ]
          })
      })
    })
    initSelectActionsPage(form)
    await flushPromises()

    await toggle(form, 'CSAM3', false)

    // CLIG3 already claimed the only surplus during the initial load's
    // refresh (only one non-quantity action may grow per response) - CMOR1
    // never had anything left to grow into, so it's still at its flat 0.0301.
    global.fetch = mockApi({ CMOR1: 0.0301 })
    await toggle(form, 'CLIG3', false)

    expect(sentPlannedActions()).toEqual([{ actionCode: 'CMOR1', quantity: 0.0301, unit: 'ha' }])
  })

  it('ignores an out-of-order (stale) response', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availability: { value: 5, unit: 'ha' } }
    ])
    let resolveFirst
    const firstResponse = new Promise((resolve) => {
      resolveFirst = () =>
        resolve({
          ok: true,
          json: () => Promise.resolve({ actions: [{ code: 'UPL1', availability: { value: 0, unit: 'ha' } }] })
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
          json: () => Promise.resolve({ actions: [{ code: 'UPL1', availability: { value: 5, unit: 'ha' } }] })
        })
      )

    const cmor1 = checkbox(form, 'CMOR1')
    cmor1.dispatchEvent(new Event('change', { bubbles: true }))
    cmor1.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    resolveFirst()
    await flushPromises()

    const upl1 = checkbox(form, 'UPL1')
    expect(upl1.disabled).toBe(false)
  })

  it('does nothing when the fetch call fails', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availability: { value: 5, unit: 'ha' } }
    ])
    global.fetch = vi.fn().mockRejectedValue(new Error('network error'))
    initSelectActionsPage(form)

    await toggle(form, 'CMOR1')

    expect(global.fetch).toHaveBeenCalled()
    expect(checkbox(form, 'UPL1').disabled).toBe(false)
    expect(checkbox(form, 'CMOR1').checked).toBe(true)
  })

  it('does nothing when the response is not ok', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'UPL1', availability: { value: 5, unit: 'ha' } }
    ])
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    initSelectActionsPage(form)

    await toggle(form, 'UPL1')

    expect(checkbox(form, 'UPL1').disabled).toBe(false)
  })

  it('ignores unrelated form input events', () => {
    const form = setupDom([{ code: 'CMOR1', availability: { value: 10, unit: 'ha' } }])
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
      { code: 'CMOR1', checked: true, availability: { value: 0.3271, unit: 'ha' }, chosenArea: 0.2271 },
      { code: 'CLIG3', availability: { value: 0.3271, unit: 'ha' } }
    ])
    // First call (triggered by checking CLIG3) reports growth for CMOR1;
    // applyRefreshResponse re-enables CMOR1 as part of applying that growth,
    // so the follow-up it triggers must re-disable it again before its own
    // fetch starts, not leave a gap until that fetch resolves.
    const fetchQueue = deferredFetchQueue()
    global.fetch = fetchQueue.mock
    initSelectActionsPage(form)
    await flushPromises()

    const cmor1Checkbox = checkbox(form, 'CMOR1')
    await toggle(form, 'CLIG3', true)

    expect(cmor1Checkbox.disabled).toBe(true)

    fetchQueue.resolveNext({ actions: [{ code: 'CMOR1', availability: { value: 0.1, unit: 'ha' } }] })
    await flushPromises()

    // The growth follow-up's own request is now in flight - CMOR1 must
    // still read as disabled, not have flashed back to enabled in between.
    expect(cmor1Checkbox.disabled).toBe(true)

    fetchQueue.resolveNext({ actions: [{ code: 'CMOR1', availability: { value: 0, unit: 'ha' } }] })
    await flushPromises()

    expect(cmor1Checkbox.disabled).toBe(false)
  })

  // A submit landing before an in-flight refresh's own response has applied
  // would otherwise serialise whatever's disabled OUT of the payload (the
  // browser drops disabled fields from a form submission)
  function isSubmitBlocked(form) {
    const event = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('blocks a submit that lands while a checkbox-triggered refresh is still in flight', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'CLIG3', availability: { value: 5, unit: 'ha' } }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    const fetchMock = deferredFetch()
    global.fetch = fetchMock.mock
    checkbox(form, 'CLIG3').checked = true
    checkbox(form, 'CLIG3').dispatchEvent(new Event('change', { bubbles: true }))

    expect(isSubmitBlocked(form)).toBe(true)

    fetchMock.resolve({ actions: [] })
    await flushPromises()
  })

  it('lets a submit through once the refresh has settled', async () => {
    const form = setupDom([{ code: 'CSAM3', checked: true, availability: { value: 10, unit: 'ha' } }])
    await initSettled(form, fetchOk({ actions: [] }))

    await toggle(form, 'CSAM3', false)

    expect(isSubmitBlocked(form)).toBe(false)
  })

  it('blocks a submit that lands during the untriggered initial refresh, which leaves every checkbox enabled', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 10, unit: 'ha' }, chosenArea: 10 },
      { code: 'SCR2', checked: true, availability: { value: 0, unit: 'ha' } }
    ])
    const fetchMock = deferredFetch()
    global.fetch = fetchMock.mock

    initSelectActionsPage(form)

    expect(isSubmitBlocked(form)).toBe(true)

    fetchMock.resolve({
      actions: [
        { code: 'CSAM3', availability: { value: 0, unit: 'ha' } },
        { code: 'SCR2', availability: { value: 0, unit: 'ha' } }
      ]
    })
    await flushPromises()

    expect(checkbox(form, 'CSAM3').disabled).toBe(false)
    expect(getChosenAreaFieldValue(checkbox(form, 'CSAM3'))).toBe('10')
    expect(checkbox(form, 'SCR2').checked).toBe(false)
    expect(checkbox(form, 'SCR2').disabled).toBe(true)
    expect(isSubmitBlocked(form)).toBe(false)
  })

  it('blocks a submit across a growth follow-up chain, only releasing once the whole chain settles', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' }, chosenArea: 1 },
      { code: 'CLIG3', availability: { value: 10, unit: 'ha' } }
    ])
    // Settle the untriggered init refresh (CMOR1 starts checked)
    await initSettled(form, fetchOk({ actions: [] }))

    const fetchQueue = deferredFetchQueue()
    global.fetch = fetchQueue.mock

    await toggle(form, 'CLIG3', true)

    expect(isSubmitBlocked(form)).toBe(true)

    // CMOR1 sent 1 (its chosenArea); this reports 2 MORE ha freed up for it,
    // so its new chosen area becomes 1 + 2 = 3
    fetchQueue.resolveNext({ actions: [{ code: 'CMOR1', availability: { value: 2, unit: 'ha' } }] })
    await flushPromises()

    expect(getChosenAreaFieldValue(checkbox(form, 'CMOR1'))).toBe('3')
    // The growth follow-up's own request (re-sending CMOR1's new claim of 3)
    // is now in flight - still blocked.
    expect(isSubmitBlocked(form)).toBe(true)

    // No further headroom this round - the chain ends here.
    fetchQueue.resolveNext({ actions: [{ code: 'CMOR1', availability: { value: 0, unit: 'ha' } }] })
    await flushPromises()

    expect(checkbox(form, 'CMOR1').disabled).toBe(false)
    expect(checkbox(form, 'CLIG3').disabled).toBe(false)
    expect(getChosenAreaFieldValue(checkbox(form, 'CMOR1'))).toBe('3')
    expect(isSubmitBlocked(form)).toBe(false)
  })

  it('disables the submit button while a refresh is in flight, and re-enables it once settled', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 10, unit: 'ha' } },
      { code: 'CLIG3', availability: { value: 5, unit: 'ha' } }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    expect(submitButton(form).disabled).toBe(false)
    expect(submitButton(form).getAttribute('aria-disabled')).toBe('false')

    const fetchMock = deferredFetch()
    global.fetch = fetchMock.mock
    checkbox(form, 'CLIG3').checked = true
    checkbox(form, 'CLIG3').dispatchEvent(new Event('change', { bubbles: true }))

    expect(submitButton(form).disabled).toBe(true)
    expect(submitButton(form).getAttribute('aria-disabled')).toBe('true')

    fetchMock.resolve({ actions: [] })
    await flushPromises()

    expect(submitButton(form).disabled).toBe(false)
    expect(submitButton(form).getAttribute('aria-disabled')).toBe('false')
  })

  it('keeps the submit button disabled across a growth follow-up chain, only re-enabling once it settles', async () => {
    const form = setupDom([
      { code: 'CMOR1', checked: true, availability: { value: 10, unit: 'ha' }, chosenArea: 1 },
      { code: 'CLIG3', availability: { value: 10, unit: 'ha' } }
    ])
    await initSettled(form, fetchOk({ actions: [] }))
    const fetchQueue = deferredFetchQueue()
    global.fetch = fetchQueue.mock

    await toggle(form, 'CLIG3', true)

    expect(submitButton(form).disabled).toBe(true)

    // Growth reported - a follow-up request fires, button must stay disabled
    // rather than flash enabled in the gap before that follow-up's own fetch.
    fetchQueue.resolveNext({ actions: [{ code: 'CMOR1', availability: { value: 2, unit: 'ha' } }] })
    await flushPromises()

    expect(submitButton(form).disabled).toBe(true)

    fetchQueue.resolveNext({ actions: [{ code: 'CMOR1', availability: { value: 0, unit: 'ha' } }] })
    await flushPromises()

    expect(submitButton(form).disabled).toBe(false)
    expect(submitButton(form).getAttribute('aria-disabled')).toBe('false')
  })
})
