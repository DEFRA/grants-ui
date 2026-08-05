import { describe, it, expect } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'confirm-land-and-actions.html', {
  pageTitle: 'Your land and actions'
})

const model = {
  parcels: [
    {
      parcelId: 'SD1234-5678',
      title: 'Land parcel SD1234 5678',
      removeHref: 'remove-parcel?parcelId=SD1234-5678',
      actions: [
        {
          action: 'Action description: CLIG3',
          area: '2 ha',
          yearlyPayment: '£100.00',
          changeHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678',
          removeHref: 'remove-action?parcelId=SD1234-5678&action=CLIG3'
        },
        {
          action: 'Action description: CSAM3',
          area: '4 ha',
          yearlyPayment: '£200.00',
          changeHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678',
          removeHref: 'remove-action?parcelId=SD1234-5678&action=CSAM3'
        }
      ],
      yearlyPayment: '£300.00'
    },
    {
      parcelId: 'CD9999-1111',
      title: 'Land parcel CD9999 1111',
      removeHref: 'remove-parcel?parcelId=CD9999-1111',
      actions: [
        {
          action: 'Action description: SCR2',
          area: '1 ha',
          yearlyPayment: '£3.00',
          changeHref: 'select-actions-for-land-parcel?parcelId=CD9999-1111',
          removeHref: 'remove-action?parcelId=CD9999-1111&action=SCR2'
        }
      ],
      yearlyPayment: '£3.00'
    }
  ],
  applicationYearlyPayment: '£1,234.00',
  hasCalculationError: false
}

const bodyText = ($) => $('main').text().replace(/\s+/g, ' ').trim()

describe('confirm-land-and-actions.html view', () => {
  it('renders the H1', () => {
    const $ = renderPage(model)
    expect($('h1').text().trim()).toBe('Your land and actions')
  })

  it('renders one summary card per parcel with a Remove parcel link', () => {
    const $ = renderPage(model)
    const cards = $('.govuk-summary-card')
    expect(cards.length).toBe(2)
    const removeParcelHrefs = $('.govuk-summary-card__actions a')
      .map((_, el) => $(el).attr('href'))
      .get()
    expect(removeParcelHrefs).toContain('remove-parcel?parcelId=SD1234-5678')
    expect(removeParcelHrefs).toContain('remove-parcel?parcelId=CD9999-1111')
  })

  it('renders the Action, Area and Yearly payment column headers', () => {
    const $ = renderPage(model)
    const headers = $('table thead th')
      .map((_, el) => $(el).text().trim())
      .get()
    expect(headers).toContain('Action')
    expect(headers).toContain('Area')
    expect(headers).toContain('Yearly payment')
  })

  it('renders each action with its area, yearly payment, Change and Remove links', () => {
    const $ = renderPage(model)
    const text = bodyText($)
    expect(text).toContain('Action description: CLIG3')
    expect(text).toContain('2 ha')
    expect(text).toContain('£100.00')

    const allHrefs = $('a')
      .map((_, el) => $(el).attr('href'))
      .get()
    expect(allHrefs).toContain('select-actions-for-land-parcel?parcelId=SD1234-5678')
    expect(allHrefs).toContain('remove-action?parcelId=SD1234-5678&action=CLIG3')
    expect(allHrefs).toContain('remove-action?parcelId=CD9999-1111&action=SCR2')
  })

  it('renders the parcel total label and application total label with values', () => {
    const $ = renderPage(model)
    const text = bodyText($)
    expect(text).toContain('Total yearly payment for land parcel')
    expect(text).toContain('£300.00')
    expect(text).toContain('Total yearly payment for application')
    expect(text).toContain('£1,234.00')
  })

  it('renders both Save and continue and Add another land parcel buttons', () => {
    const $ = renderPage(model)
    const buttons = $('form button, form input[type="submit"]')
      .map((_, el) => `${$(el).attr('name')}=${$(el).attr('value')}:${$(el).text().trim()}`)
      .get()
    const joined = buttons.join(' ')
    expect(joined).toContain('action=continue')
    expect(joined).toContain('Save and continue')
    expect(joined).toContain('action=add-another')
    expect(joined).toContain('Add another land parcel')
  })

  it('renders a crumb hidden field in the form', () => {
    const $ = renderPage(model)
    expect($('form input[name="crumb"]').attr('value')).toBe('test-crumb')
  })

  describe('calculation error', () => {
    const errorModel = {
      hasCalculationError: true,
      errors: [
        { text: 'Unable to get payment information, please try again later or contact the Rural Payments Agency.' }
      ]
    }

    it('renders the GOV.UK error summary and omits payment rows and buttons', () => {
      const $ = renderPage(errorModel)
      expect($('.govuk-error-summary__title').text().trim()).toBe('There is a problem')
      expect(bodyText($)).toContain(
        'Unable to get payment information, please try again later or contact the Rural Payments Agency.'
      )
      expect($('.govuk-summary-card').length).toBe(0)
      expect($('table').length).toBe(0)
      expect($('form button, form input[type="submit"]').length).toBe(0)
      expect(bodyText($)).not.toContain('Total yearly payment for application')
    })
  })
})
