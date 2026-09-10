// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchOk,
  hintFor,
  initSettled,
  mockApi,
  quantityInputFor,
  sentPlannedActions,
  setupDom,
  toggle,
  typeQuantity
} from './select-actions-page.test-helpers.js'

describe('quantity input validation', () => {
  const errorFor = (code) => document.getElementById(`landActionQuantity_${code}-error`)
  const formGroupFor = (form, code) => quantityInputFor(form, code).closest('.govuk-form-group')

  async function initSingleAction({ quantityValue = '', checked = true, hasError = false } = {}) {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked,
        availability: { value: 11.22, unit: 'ha' },
        requiresMaxQuantity: 11.22,
        quantityValue,
        hasError
      },
      { code: 'CLIG3', availability: { value: 11.22, unit: 'ha' } }
    ])
    await initSettled(form, fetchOk({ actions: [] }))
    return form
  }

  beforeEach(() => {
    window.history.pushState({}, '', '/select-actions?parcelId=SD6843-7039')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects fractional square metres before sending a HEF1 claim and accepts a whole quantity', async () => {
    const form = setupDom([
      {
        code: 'HEF1',
        checked: true,
        availability: { value: null, unit: 'sqm' },
        requiresMaxQuantity: true,
        unrestricted: true
      }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    await typeQuantity(form, 'HEF1', '4.5')
    expect(errorFor('HEF1').textContent).toContain('Must be a whole number')
    expect(global.fetch).not.toHaveBeenCalled()

    await typeQuantity(form, 'HEF1', '4')
    expect(errorFor('HEF1')).toBeNull()
    expect(sentPlannedActions()).toEqual([{ actionCode: 'HEF1', quantity: 4, unit: 'sqm' }])
  })

  it('keeps bounded square-metre limits and unit propagation through refreshes', async () => {
    const form = setupDom([
      {
        code: 'HEF1',
        checked: true,
        availability: { value: 12, unit: 'sqm' },
        requiresMaxQuantity: 12
      }
    ])
    await initSettled(form, fetchOk({ actions: [{ code: 'HEF1', availability: { value: 12, unit: 'sqm' } }] }))

    const input = quantityInputFor(form, 'HEF1')
    expect(hintFor('HEF1').textContent).toBe('12 square metres available')
    expect(input.max).toBe('12')

    await typeQuantity(form, 'HEF1', '12')
    expect(errorFor('HEF1')).toBeNull()
    expect(sentPlannedActions()).toEqual([{ actionCode: 'HEF1', quantity: 12, unit: 'sqm' }])
    expect(input.max).toBe('12')
    expect(hintFor('HEF1').textContent).toBe('12 square metres available')

    await typeQuantity(form, 'HEF1', '13')
    expect(errorFor('HEF1').textContent).toContain('More than available area')
    expect(global.fetch).toHaveBeenCalledTimes(1)

    // Zero, negative, and non-numeric values are covered by shared validation;
    // this case only protects the unit-specific fractional rule.
    await typeQuantity(form, 'HEF1', '12.5')
    expect(errorFor('HEF1').textContent).toContain('Must be a whole number')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  // The field must read back the same value that gets submitted, so a bare
  // decimal gains its leading zero and padding is trimmed - neither is an error.
  it.each([
    ['.5', '0.5'],
    ['  1.5  ', '1.5']
  ])('normalises %j to %j on blur', async (typed, expected) => {
    const form = await initSingleAction()

    const input = await typeQuantity(form, 'CSAM3', typed)

    expect(input.value).toBe(expected)
    expect(errorFor('CSAM3')).toBeNull()
  })

  // Every error is reported in both places, like every other error on this
  // page: the summary at the top, and the message on the field itself.
  it.each([
    ['20', 'Enter up to 11.22 hectares'],
    ['0', 'Enter a number greater than 0'],
    ['-11', 'Enter a number of hectares, for example 12.5 or 100'],
    ['11.22001', 'Enter a number of hectares, for example 12.5 or 100'],
    ['as', 'Enter a number of hectares, for example 12.5 or 100']
  ])('reports %j everywhere an error is shown, on blur', async (value, message) => {
    const form = await initSingleAction()

    const input = await typeQuantity(form, 'CSAM3', value)

    expect(errorFor('CSAM3').textContent).toContain(message)
    expect(errorFor('CSAM3').querySelector('.govuk-visually-hidden').textContent).toBe('Error:')
    expect(input.classList).toContain('govuk-input--error')
    expect(formGroupFor(form, 'CSAM3').classList).toContain('govuk-form-group--error')
    expect(input.getAttribute('aria-describedby')).toBe('landActionQuantity_CSAM3-hint landActionQuantity_CSAM3-error')

    const link = document.querySelector('.govuk-error-summary__list a')
    expect(link.textContent).toBe(message)
    expect(link.getAttribute('href')).toBe('#landActionQuantity_CSAM3')
  })

  it('takes the summary away with the last error, rather than leaving an empty "There is a problem"', async () => {
    const form = await initSingleAction()
    await typeQuantity(form, 'CSAM3', '20')
    expect(document.querySelector('.govuk-error-summary')).not.toBeNull()

    await typeQuantity(form, 'CSAM3', '1.5')

    expect(document.querySelector('.govuk-error-summary')).toBeNull()
  })

  it('replaces a server-rendered summary entry for the same field rather than listing it twice', async () => {
    const form = setupDom(
      [
        {
          code: 'CSAM3',
          checked: true,
          availability: { value: 11.22, unit: 'ha' },
          requiresMaxQuantity: 11.22,
          quantityValue: '11.22001',
          hasError: true
        }
      ],
      {
        summaryErrors: [
          { href: '#landActionQuantity_CSAM3', text: 'Enter a number of hectares, for example 12.5 or 100' }
        ]
      }
    )
    await initSettled(form, fetchOk({ actions: [] }))

    await typeQuantity(form, 'CSAM3', '20')

    const links = document.querySelectorAll('.govuk-error-summary__list a')
    expect(links).toHaveLength(1)
    expect(links[0].textContent).toBe('Enter up to 11.22 hectares')
  })

  it('lists one entry per failing action when more than one is wrong', async () => {
    const form = setupDom([
      { code: 'CSAM3', checked: true, availability: { value: 11.22, unit: 'ha' }, requiresMaxQuantity: 11.22 },
      { code: 'UPL8', checked: true, availability: { value: 11.22, unit: 'ha' }, requiresMaxQuantity: 11.22 }
    ])
    await initSettled(form, fetchOk({ actions: [] }))

    await typeQuantity(form, 'CSAM3', '20')
    await typeQuantity(form, 'UPL8', 'as')

    const links = [...document.querySelectorAll('.govuk-error-summary__list a')]
    expect(links.map((a) => [a.getAttribute('href'), a.textContent])).toEqual([
      ['#landActionQuantity_CSAM3', 'Enter up to 11.22 hectares'],
      ['#landActionQuantity_UPL8', 'Enter a number of hectares, for example 12.5 or 100']
    ])
  })

  it('keeps the invalid value in the field rather than silently discarding what the user typed', async () => {
    const form = await initSingleAction()

    const input = await typeQuantity(form, 'CSAM3', '11.22001')

    expect(input.value).toBe('11.22001')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('says nothing about an empty field, which is the server-side message on submit', async () => {
    const form = await initSingleAction()

    await typeQuantity(form, 'CSAM3', '')

    expect(errorFor('CSAM3')).toBeNull()
  })

  it('clears the error on the first real edit, without waiting for the new value to be valid', async () => {
    const form = await initSingleAction()
    const input = await typeQuantity(form, 'CSAM3', 'as')
    expect(errorFor('CSAM3')).not.toBeNull()

    input.focus()
    input.value = '0'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(errorFor('CSAM3')).toBeNull()
    expect(input.classList).not.toContain('govuk-input--error')
    expect(formGroupFor(form, 'CSAM3').classList).not.toContain('govuk-form-group--error')
    expect(input.getAttribute('aria-describedby')).toBe('landActionQuantity_CSAM3-hint')
  })

  it('does not leave a server-rendered error sitting there through every keystroke of the fix', async () => {
    const form = await initSingleAction({ quantityValue: '11.22001', hasError: true })

    const input = quantityInputFor(form, 'CSAM3')
    input.focus()
    // Clearing the field is already an edit - the error must go here, not
    // wait until a whole valid replacement value has been typed.
    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(errorFor('CSAM3')).toBeNull()
  })

  it('decides the error again on blur, so an edit that is still wrong is reported once the user leaves', async () => {
    const form = await initSingleAction()
    await typeQuantity(form, 'CSAM3', 'as')

    const input = quantityInputFor(form, 'CSAM3')
    input.focus()
    input.value = '0'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(errorFor('CSAM3')).toBeNull()

    input.dispatchEvent(new Event('blur'))

    expect(errorFor('CSAM3').textContent).toContain('Enter a number greater than 0')
  })

  it('does not flag a part-typed decimal mid-keystroke', async () => {
    const form = await initSingleAction()

    const input = quantityInputFor(form, 'CSAM3')
    input.value = '0.'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(errorFor('CSAM3')).toBeNull()
  })

  it('clears a server-rendered error once the value is corrected', async () => {
    const form = await initSingleAction({ quantityValue: '11.22001', hasError: true })

    const input = await typeQuantity(form, 'CSAM3', '1.5')

    expect(errorFor('CSAM3')).toBeNull()
    expect(input.classList).not.toContain('govuk-input--error')
  })

  it('sends a normalised bare decimal as its numeric value', async () => {
    const form = await initSingleAction()

    await typeQuantity(form, 'CSAM3', '.5')

    expect(sentPlannedActions()).toEqual([{ actionCode: 'CSAM3', quantity: 0.5, unit: 'ha' }])
  })

  it('takes the error away with the value when a refresh reverts an invalid edit', async () => {
    const form = setupDom([
      {
        code: 'CSAM3',
        checked: true,
        availability: { value: 11.22, unit: 'ha' },
        requiresMaxQuantity: 11.22,
        quantityValue: '5'
      },
      { code: 'CLIG3', availability: { value: 11.22, unit: 'ha' } }
    ])
    await initSettled(form, mockApi({ CSAM3: 11.22, CLIG3: 11.22 }))

    const input = await typeQuantity(form, 'CSAM3', 'as')
    expect(errorFor('CSAM3')).not.toBeNull()

    await toggle(form, 'CLIG3', true)

    expect(input.value).toBe('5')
    expect(errorFor('CSAM3')).toBeNull()
    expect(input.classList).not.toContain('govuk-input--error')
  })
})
