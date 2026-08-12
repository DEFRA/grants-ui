import { describe, it, expect } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'confirm-land-and-actions.html', {
  pageTitle: 'Your land and actions'
})

const model = {
  parcels: [
    {
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
  additionalYearlyPayments: [],
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

  it('renders each action row inside its own parcel card, in order', () => {
    const $ = renderPage(model)
    const rowsOf = (index) =>
      $('.govuk-summary-card')
        .eq(index)
        .find('tbody tr')
        .map((_, tr) =>
          $(tr)
            .find('th, td')
            .map((__, cell) => $(cell).text().trim())
            .get()
            .slice(0, 3)
            .join('|')
        )
        .get()

    expect(rowsOf(0)).toEqual([
      'Action description: CLIG3|2 ha|£100.00',
      'Action description: CSAM3|4 ha|£200.00',
      'Total yearly payment for land parcel||£300.00'
    ])
    expect(rowsOf(1)).toEqual(['Action description: SCR2|1 ha|£3.00', 'Total yearly payment for land parcel||£3.00'])
  })

  it('names each action row with a row header so the money cells are associated', () => {
    const $ = renderPage(model)
    const rowHeaders = $('.govuk-summary-card')
      .eq(0)
      .find('tbody tr th[scope="row"]')
      .map((_, el) => $(el).text().trim())
      .get()

    expect(rowHeaders).toEqual([
      'Action description: CLIG3',
      'Action description: CSAM3',
      'Total yearly payment for land parcel'
    ])
  })

  it('gives the Change and Remove links accessible names, and escapes the hrefs once', () => {
    const $ = renderPage(model)
    const firstCard = $('.govuk-summary-card').eq(0)

    expect(firstCard.find('tbody tr').eq(0).find('a').eq(0).text().trim()).toBe('Change Action description: CLIG3')
    expect(firstCard.find('tbody tr').eq(0).find('a').eq(1).attr('href')).toBe(
      'remove-action?parcelId=SD1234-5678&action=CLIG3'
    )
    expect($('.govuk-summary-card').eq(1).find('tbody tr').eq(0).find('a').eq(1).attr('href')).toBe(
      'remove-action?parcelId=CD9999-1111&action=SCR2'
    )
  })

  it('escapes action text rather than trusting it as markup', () => {
    const $ = renderPage({
      ...model,
      parcels: [
        { ...model.parcels[0], actions: [{ ...model.parcels[0].actions[0], action: '<script>x</script> & co' }] }
      ]
    })

    expect($('main script').length).toBe(0)
    expect(bodyText($)).toContain('<script>x</script> & co')
  })

  it('renders agreement-level items in their own card when present', () => {
    const $ = renderPage({
      ...model,
      additionalYearlyPayments: [{ action: 'Assess moorland: CMOR1', yearlyPayment: '£272.00' }]
    })
    const cards = $('.govuk-summary-card')

    expect(cards.length).toBe(3)
    expect(cards.eq(2).find('.govuk-summary-card__title').text().trim()).toBe('Additional yearly payments')
    expect(
      cards
        .eq(2)
        .find('tbody tr')
        .eq(0)
        .find('th, td')
        .map((_, cell) => $(cell).text().trim())
        .get()
    ).toEqual(['Assess moorland: CMOR1', '£272.00'])
  })

  it('omits the agreement-level card when there are no such items', () => {
    const $ = renderPage(model)

    expect(bodyText($)).not.toContain('Additional yearly payments')
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
      ],
      retryHref: '/test-grant/confirm-land-and-actions',
      selectLandParcelHref: '/test-grant/select-land-parcel'
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

    it('offers a way forward rather than dead-ending on the error summary', () => {
      const $ = renderPage(errorModel)
      const hrefs = $('main a')
        .map((_, el) => $(el).attr('href'))
        .get()

      expect($('main').text()).toContain('Try again')
      expect(hrefs).toContain('/test-grant/confirm-land-and-actions')
      expect(hrefs).toContain('/test-grant/select-land-parcel')
    })
  })
})
