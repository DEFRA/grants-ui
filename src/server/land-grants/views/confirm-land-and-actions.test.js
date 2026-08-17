import { describe, it, expect } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'confirm-land-and-actions.html', {
  pageTitle: 'Your land and actions'
})

// Mirrors what buildConfirmLandAndActionsViewModel produces for the fixture in
// confirm-land-and-actions.view-model.test.js, so the two tests together pin the
// whole chain from API payload to rendered row.
const model = {
  parcels: [
    {
      reference: 'SD1234 5678',
      removeHref: 'remove-parcel?parcelId=SD1234-5678',
      areaSummary: { total: '12.0000 ha', used: '6.0000 ha', available: '6.0000 ha' },
      actions: [
        {
          action: 'Action description (CLIG3)',
          area: '2.0000 ha',
          yearlyPayment: '£10.00',
          changeHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678'
        },
        {
          action: 'Another action (CSAM3)',
          area: '4.0000 ha',
          yearlyPayment: '£20.00',
          changeHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678'
        }
      ],
      yearlyPayment: '£30.00'
    },
    {
      reference: 'CD9999 1111',
      removeHref: 'remove-parcel?parcelId=CD9999-1111',
      areaSummary: { total: '3.0000 ha', used: '1.0000 ha', available: '2.0000 ha' },
      actions: [
        {
          action: 'Third action (SCR2)',
          area: '1.0000 ha',
          yearlyPayment: '£3.00',
          changeHref: 'select-actions-for-land-parcel?parcelId=CD9999-1111'
        }
      ],
      yearlyPayment: '£3.00'
    }
  ],
  additionalYearlyPayments: [],
  applicationYearlyPayment: '£1,234.00',
  hasCalculationError: false
}

const normalise = (text) => text.replace(/\s+/g, ' ').trim()
const bodyText = ($) => normalise($('main').text())

/** Row header|value pairs of the table inside the nth `.land-parcel-summary` block. */
const rowsOf = ($, index) =>
  $('.land-parcel-summary')
    .eq(index)
    .find('.govuk-table__row')
    .map((_, row) =>
      [
        normalise($(row).find('.govuk-table__header').text()),
        normalise($(row).find('.govuk-table__cell').first().text())
      ].join('|')
    )
    .get()

describe('confirm-land-and-actions.html view', () => {
  describe('land parcel removal success banner', () => {
    const message = 'SK0971 4776 and its actions have been removed.'

    it('renders a GOV.UK success banner above the H1', () => {
      const $ = renderPage({ ...model, landParcelRemovalSuccessMessage: message })

      const banner = $('main .govuk-notification-banner')
      expect(banner).toHaveLength(1)
      expect(banner.hasClass('govuk-notification-banner--success')).toBe(true)
      expect(banner.attr('role')).toBe('alert')
      expect(normalise(banner.find('.govuk-notification-banner__title').text())).toBe('Success')
      expect(normalise(banner.find('.govuk-notification-banner__heading').text())).toBe(message)

      // Position matters: the outcome must be the first thing announced.
      expect(banner.nextAll('h1')).toHaveLength(1)
    })

    it('renders no banner when nothing was removed', () => {
      const $ = renderPage(model)

      expect($('main .govuk-notification-banner')).toHaveLength(0)
    })
  })

  it('renders the H1 with a caption above the page title', () => {
    const $ = renderPage(model)
    expect(normalise($('h1').text())).toBe('Select land and actions Your land and actions')
    expect(normalise($('h1 span.govuk-caption-l').text())).toBe('Select land and actions')
  })

  it('uses the configured section title as the caption when one is set', () => {
    const $ = renderPage({ ...model, sectionTitle: 'Land and actions' })
    expect(normalise($('h1 span.govuk-caption-l').text())).toBe('Land and actions')
  })

  it('falls back to the standard caption rather than repeating the page title', () => {
    const $ = renderPage({ ...model, sectionTitle: 'Your land and actions' })
    expect(normalise($('h1 span.govuk-caption-l').text())).toBe('Select land and actions')
    expect(normalise($('h1').text())).toBe('Select land and actions Your land and actions')
  })

  it('renders no caption element outside the H1', () => {
    const $ = renderPage(model)
    expect($('main .govuk-caption-l').length).toBe(1)
    expect($('main .govuk-caption-l').parent().is('h1')).toBe(true)
  })

  it('renders the page in a full-width column so the parcel rows have room', () => {
    const $ = renderPage(model)
    expect($('h1').parent().attr('class')).toBe('govuk-grid-column-full')
  })

  it('renders one block per parcel, headed by the bare reference with a removal link', () => {
    const $ = renderPage(model)
    const blocks = $('.land-parcel-summary--parcel')
    expect(blocks.length).toBe(2)

    expect(blocks.eq(0).find('h2').text().trim()).toBe('SD1234 5678')
    expect(blocks.eq(1).find('h2').text().trim()).toBe('CD9999 1111')

    const removeParcelLinks = blocks
      .find('.land-parcel-summary__heading a')
      .map((_, el) => `${$(el).attr('href')}:${normalise($(el).text())}`)
      .get()
    expect(removeParcelLinks).toEqual([
      'remove-parcel?parcelId=SD1234-5678:Remove this land parcel and all actions for land parcel SD1234 5678',
      'remove-parcel?parcelId=CD9999-1111:Remove this land parcel and all actions for land parcel CD9999 1111'
    ])
  })

  it('renders the three area rows before the actions, in design order', () => {
    const $ = renderPage(model)

    expect(rowsOf($, 0).slice(0, 3)).toEqual([
      'Total area|12.0000 ha',
      'Area used for actions|6.0000 ha',
      'Available area left|6.0000 ha'
    ])
  })

  it('renders a negative available area as given, rather than hiding it', () => {
    const $ = renderPage({
      ...model,
      parcels: [
        {
          ...model.parcels[0],
          areaSummary: { total: '56.3210 ha', used: '78.9630 ha', available: '-22.6420 ha' }
        }
      ]
    })

    expect(rowsOf($, 0)).toContain('Available area left|-22.6420 ha')
  })

  it('omits all three area rows when the view model could not derive them', () => {
    const $ = renderPage({
      ...model,
      parcels: [{ ...model.parcels[0], areaSummary: undefined }]
    })
    const text = bodyText($)

    expect(text).not.toContain('Total area')
    expect(text).not.toContain('Area used for actions')
    expect(text).not.toContain('Available area left')
    expect(rowsOf($, 0)).toEqual([
      'Action description (CLIG3)|2.0000 ha (£10.00)',
      'Another action (CSAM3)|4.0000 ha (£20.00)',
      'Yearly payment for this parcel|£30.00'
    ])
  })

  it('renders each action as a table row showing its area and payment, in order', () => {
    const $ = renderPage(model)

    expect(rowsOf($, 0).slice(3)).toEqual([
      'Action description (CLIG3)|2.0000 ha (£10.00)',
      'Another action (CSAM3)|4.0000 ha (£20.00)',
      'Yearly payment for this parcel|£30.00'
    ])
    expect(rowsOf($, 1).slice(3)).toEqual([
      'Third action (SCR2)|1.0000 ha (£3.00)',
      'Yearly payment for this parcel|£3.00'
    ])
  })

  it('renders the payment alone when the API priced an action without an area', () => {
    const $ = renderPage({
      ...model,
      parcels: [{ ...model.parcels[0], actions: [{ ...model.parcels[0].actions[0], area: '' }] }]
    })

    expect(rowsOf($, 0).slice(3)).toEqual([
      'Action description (CLIG3)|£10.00',
      'Yearly payment for this parcel|£30.00'
    ])
  })

  it('names every row with a scoped row header so each value is associated', () => {
    const $ = renderPage(model)
    const headers = $('.land-parcel-summary')
      .eq(0)
      .find('th.govuk-table__header[scope="row"]')
      .map((_, el) => normalise($(el).text()))
      .get()

    expect(headers).toEqual([
      'Total area',
      'Area used for actions',
      'Available area left',
      'Action description (CLIG3)',
      'Another action (CSAM3)',
      'Yearly payment for this parcel'
    ])
  })

  it('marks only action rows so their extra spacing reaches neither area nor total rows', () => {
    const $ = renderPage(model)
    const block = $('.land-parcel-summary').eq(0)

    expect(block.find('.land-parcel-summary__action-row').length).toBe(2)
    expect(
      block
        .find('.land-parcel-summary__action-row .govuk-table__header')
        .map((_, el) => normalise($(el).text()))
        .get()
    ).toEqual(['Action description (CLIG3)', 'Another action (CSAM3)'])
    expect(block.find('.govuk-table__row').last().hasClass('land-parcel-summary__action-row')).toBe(false)
  })

  it('gives each parcel table a caption naming the parcel, for screen readers only', () => {
    const $ = renderPage(model)
    const caption = $('.land-parcel-summary').eq(0).find('caption')

    expect(normalise(caption.text())).toBe('Area, actions and yearly payment for land parcel SD1234 5678')
    expect(caption.hasClass('govuk-visually-hidden')).toBe(true)
  })

  it('offers only Change on an action row, with an accessible name and a single-escaped href', () => {
    const $ = renderPage(model)
    const firstAction = $('.land-parcel-summary').eq(0).find('.land-parcel-summary__action-row').eq(0)

    expect(firstAction.find('a').length).toBe(1)
    expect(normalise(firstAction.find('a').text())).toBe('Change Action description (CLIG3)')
    expect(firstAction.find('a').attr('href')).toBe('select-actions-for-land-parcel?parcelId=SD1234-5678')
  })

  it('renders no action-level Remove control anywhere on the page', () => {
    const $ = renderPage(model)
    const actionHrefs = $('.land-parcel-summary__action-row a')
      .map((_, el) => $(el).attr('href'))
      .get()

    expect(actionHrefs.some((href) => href.startsWith('remove-action'))).toBe(false)
  })

  it('keeps the row controls in their own right-aligned cell', () => {
    const $ = renderPage(model)
    const controls = $('.land-parcel-summary').eq(0).find('.land-parcel-summary__action-row').eq(0).find('td').last()

    expect(controls.hasClass('land-parcel-summary__actions')).toBe(true)
    expect(controls.find('a').length).toBe(1)
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

  it('renders agreement-level items in their own block when present', () => {
    const $ = renderPage({
      ...model,
      additionalYearlyPayments: [{ action: 'Assess moorland (CMOR1)', yearlyPayment: '£272.00' }]
    })
    const blocks = $('.land-parcel-summary')

    expect(blocks.length).toBe(3)
    expect(blocks.eq(2).find('h2').text().trim()).toBe('Additional yearly payments')
    expect(rowsOf($, 2)).toEqual(['Assess moorland (CMOR1)|£272.00'])
    expect(blocks.eq(2).find('.land-parcel-summary__action-row').length).toBe(0)
    expect(blocks.eq(2).hasClass('land-parcel-summary--parcel')).toBe(false)
    expect($('.land-parcel-summary--parcel').length).toBe(2)
  })

  it('omits the agreement-level block when there are no such items', () => {
    const $ = renderPage(model)

    expect(bodyText($)).not.toContain('Additional yearly payments')
  })

  it('renders the parcel total label and application total label with values', () => {
    const $ = renderPage(model)
    const text = bodyText($)
    expect(text).toContain('Yearly payment for this parcel')
    expect(text).toContain('£30.00')
    expect(text).toContain('Total yearly payment')
    expect(text).toContain('£1,234.00')
  })

  it('renders the application total in its own table outside the parcel blocks', () => {
    const $ = renderPage(model)
    const applicationTotalRow = $('.govuk-table__row')
      .filter((_, row) => normalise($(row).find('.govuk-table__header').text()) === 'Total yearly payment')
      .first()

    expect(applicationTotalRow.length).toBe(1)
    expect(applicationTotalRow.closest('.land-parcel-summary').length).toBe(0)
    expect(normalise(applicationTotalRow.find('.govuk-table__cell').first().text())).toBe('£1,234.00')
    expect(normalise(applicationTotalRow.closest('table').find('caption').text())).toBe(
      'Total yearly payment for the grant application'
    )
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
      expect($('.land-parcel-summary').length).toBe(0)
      expect($('.govuk-table').length).toBe(0)
      expect($('form button, form input[type="submit"]').length).toBe(0)
      expect(bodyText($)).not.toContain('Total yearly payment')
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
