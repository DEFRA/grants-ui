import { describe, it, expect } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'confirm-land-and-actions.html', {
  pageTitle: 'Review land parcels and actions'
})

// Matches what buildConfirmLandAndActionsViewModel returns for the fixture in
// confirm-land-and-actions.view-model.test.js, so between them the two tests cover
// the API payload and the rendered rows.
const model = {
  parcels: [
    {
      reference: 'SD1234 5678',
      removeHref: 'remove-parcel?parcelId=SD1234-5678',
      addActionsHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678',
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
      addActionsHref: 'select-actions-for-land-parcel?parcelId=CD9999-1111',
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

/** Every summary card on the page, parcel cards first. */
const cards = ($) => $('.govuk-summary-card')

/** Body row cell text (`Action|Quantity|Yearly payment`) of the nth parcel card. */
const rowsOf = ($, index) =>
  cards($)
    .eq(index)
    .find('.govuk-table__body .govuk-table__row')
    .map((_, row) =>
      [
        normalise($(row).find('.govuk-table__header').text()),
        normalise($(row).find('.govuk-table__cell').eq(0).text()),
        normalise($(row).find('.govuk-table__cell').eq(1).text())
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

      expect(banner.nextAll('h1')).toHaveLength(1)
    })

    it('renders no banner when nothing was removed', () => {
      const $ = renderPage(model)

      expect($('main .govuk-notification-banner')).toHaveLength(0)
    })
  })

  it('renders the H1 with a caption above the design heading', () => {
    const $ = renderPage(model)
    expect(normalise($('h1').text())).toBe('Select land and actions Review land parcels and actions')
    expect(normalise($('h1 span.govuk-caption-l').text())).toBe('Select land and actions')
  })

  it('uses the configured section title as the caption when one is set', () => {
    const $ = renderPage({ ...model, sectionTitle: 'Land and actions' })
    expect(normalise($('h1 span.govuk-caption-l').text())).toBe('Land and actions')
  })

  it('falls back to the standard caption rather than repeating the page title', () => {
    const $ = renderPage({ ...model, sectionTitle: 'Review land parcels and actions' })
    expect(normalise($('h1 span.govuk-caption-l').text())).toBe('Select land and actions')
    expect(normalise($('h1').text())).toBe('Select land and actions Review land parcels and actions')
  })

  it('renders no caption element outside the H1', () => {
    const $ = renderPage(model)
    expect($('main .govuk-caption-l')).toHaveLength(1)
    expect($('main .govuk-caption-l').parent().is('h1')).toBe(true)
  })

  it('renders the page in a full-width column so the parcel rows have room', () => {
    const $ = renderPage(model)
    expect($('h1').parent().attr('class')).toBe('govuk-grid-column-full')
  })

  it('renders one summary card per parcel, titled by its reference, with a removal action', () => {
    const $ = renderPage(model)
    const parcelCards = cards($).filter(
      (_, card) => normalise($(card).find('.govuk-summary-card__title').text()) !== 'Payment summary'
    )
    expect(parcelCards).toHaveLength(2)

    expect(normalise(parcelCards.eq(0).find('.govuk-summary-card__title').text())).toBe('Parcel reference SD1234 5678')
    expect(normalise(parcelCards.eq(1).find('.govuk-summary-card__title').text())).toBe('Parcel reference CD9999 1111')

    const removeParcelLinks = parcelCards
      .find('.govuk-summary-card__actions a')
      .map((_, el) => `${$(el).attr('href')}:${normalise($(el).text())}`)
      .get()
    expect(removeParcelLinks).toEqual([
      'remove-parcel?parcelId=SD1234-5678:Remove parcel and all actions for land parcel SD1234 5678',
      'remove-parcel?parcelId=CD9999-1111:Remove parcel and all actions for land parcel CD9999 1111'
    ])
  })

  it('heads each parcel table with the action, quantity and payment columns', () => {
    const $ = renderPage(model)
    const headers = cards($)
      .eq(0)
      .find('.govuk-table__head th')
      .map((_, el) => normalise($(el).text()))
      .get()

    expect(headers).toEqual(['Action', 'Quantity', 'Yearly payment', 'Change action'])
  })

  it('renders each action as a row of name, quantity and payment, then the parcel subtotal', () => {
    const $ = renderPage(model)

    expect(rowsOf($, 0)).toEqual([
      'Action description (CLIG3)|2.0000 ha|£10.00',
      'Another action (CSAM3)|4.0000 ha|£20.00',
      'Subtotal||£30.00'
    ])
    expect(rowsOf($, 1)).toEqual(['Third action (SCR2)|1.0000 ha|£3.00', 'Subtotal||£3.00'])
  })

  it('leaves the quantity cell empty when the API priced an action without an area', () => {
    const $ = renderPage({
      ...model,
      parcels: [{ ...model.parcels[0], actions: [{ ...model.parcels[0].actions[0], area: '' }] }]
    })

    expect(rowsOf($, 0)).toEqual(['Action description (CLIG3)||£10.00', 'Subtotal||£30.00'])
  })

  it('names every row with a scoped row header so each value is associated', () => {
    const $ = renderPage(model)
    const headers = cards($)
      .eq(0)
      .find('th.govuk-table__header[scope="row"]')
      .map((_, el) => normalise($(el).text()))
      .get()

    expect(headers).toEqual(['Action description (CLIG3)', 'Another action (CSAM3)', 'Subtotal'])
  })

  it('gives each parcel table a caption naming the parcel, for screen readers only', () => {
    const $ = renderPage(model)
    const caption = cards($).eq(0).find('caption')

    expect(normalise(caption.text())).toBe('Actions, quantity and yearly payment for land parcel SD1234 5678')
    expect(caption.hasClass('govuk-visually-hidden')).toBe(true)
  })

  it('offers only Change on an action row, with an accessible name and a single-escaped href', () => {
    const $ = renderPage(model)
    const firstAction = cards($).eq(0).find('.govuk-table__body .govuk-table__row').eq(0)

    expect(firstAction.find('a')).toHaveLength(1)
    expect(normalise(firstAction.find('a').text())).toBe('Change Action description (CLIG3)')
    expect(firstAction.find('a').attr('href')).toBe('select-actions-for-land-parcel?parcelId=SD1234-5678')
  })

  it('renders no action-level Remove control anywhere on the page', () => {
    const $ = renderPage(model)
    const actionHrefs = $('.govuk-table__body a')
      .map((_, el) => $(el).attr('href'))
      .get()

    expect(actionHrefs.some((href) => href.startsWith('remove-action'))).toBe(false)
  })

  it('offers an add-more-actions link per parcel, below its table', () => {
    const $ = renderPage(model)
    const links = cards($)
      .find('.govuk-summary-card__content > p a')
      .map((_, el) => `${$(el).attr('href')}:${normalise($(el).text())}`)
      .get()

    expect(links).toEqual([
      'select-actions-for-land-parcel?parcelId=SD1234-5678:Add more actions to this parcel SD1234 5678',
      'select-actions-for-land-parcel?parcelId=CD9999-1111:Add more actions to this parcel CD9999 1111'
    ])
  })

  describe('action requirement hint', () => {
    const withRequirement = (requirementText) => ({
      ...model,
      parcels: [
        {
          ...model.parcels[0],
          actions: [{ ...model.parcels[0].actions[0], requirementText }, model.parcels[0].actions[1]]
        },
        model.parcels[1]
      ]
    })

    it.each([['Requires SSSI consent'], ['Requires an SFI HEFER'], ['Requires SSSI consent and an SFI HEFER']])(
      'renders %s as secondary text beneath its own action name',
      (requirementText) => {
        const $ = renderPage(withRequirement(requirementText))
        const rows = cards($).eq(0).find('.govuk-table__body .govuk-table__row')
        const header = rows.eq(0).find('.govuk-table__header')
        const hint = header.find('.land-parcel-summary__action-hint')

        expect(hint).toHaveLength(1)
        expect(normalise(hint.text())).toBe(requirementText)
        expect(normalise(header.text())).toBe(`Action description (CLIG3) ${requirementText}`)
        expect(rows.eq(1).find('.land-parcel-summary__action-hint')).toHaveLength(0)
      }
    )

    it('leaves the action quantity, payment and Change control untouched', () => {
      const $ = renderPage(withRequirement('Requires SSSI consent'))
      const row = cards($).eq(0).find('.govuk-table__body .govuk-table__row').eq(0)

      expect(normalise(row.find('.govuk-table__cell').eq(0).text())).toBe('2.0000 ha')
      expect(normalise(row.find('.govuk-table__cell').eq(1).text())).toBe('£10.00')
      expect(normalise(row.find('a').text())).toBe('Change Action description (CLIG3)')
      expect(row.find('.govuk-table__cell .land-parcel-summary__action-hint')).toHaveLength(0)
    })

    it('renders no hint element for an action with no requirement', () => {
      const $ = renderPage(model)

      expect($('.land-parcel-summary__action-hint')).toHaveLength(0)
    })

    it('adds no inset or extra link alongside the hint', () => {
      const $ = renderPage(withRequirement('Requires SSSI consent'))

      expect($('main .govuk-inset-text')).toHaveLength(0)
      expect($('.land-parcel-summary__action-hint a')).toHaveLength(0)
    })

    it('escapes requirement text rather than trusting it as markup', () => {
      const $ = renderPage(withRequirement('<script>x</script> & co'))

      expect($('main script')).toHaveLength(0)
      expect(bodyText($)).toContain('<script>x</script> & co')
    })
  })

  it('escapes action text rather than trusting it as markup', () => {
    const $ = renderPage({
      ...model,
      parcels: [
        { ...model.parcels[0], actions: [{ ...model.parcels[0].actions[0], action: '<script>x</script> & co' }] }
      ]
    })

    expect($('main script')).toHaveLength(0)
    expect(bodyText($)).toContain('<script>x</script> & co')
  })

  it('renders agreement-level items as payment summary rows above the total', () => {
    const $ = renderPage({
      ...model,
      additionalYearlyPayments: [{ action: 'Assess moorland (CMOR1)', yearlyPayment: '£272.00' }]
    })
    const summary = cards($).last()

    expect(normalise(summary.find('.govuk-summary-card__title').text())).toBe('Payment summary')
    expect(
      summary
        .find('.govuk-summary-list__row')
        .map((_, row) =>
          [
            normalise($(row).find('.govuk-summary-list__key').text()),
            normalise($(row).find('.govuk-summary-list__value').text())
          ].join('|')
        )
        .get()
    ).toEqual(['Assess moorland (CMOR1)|£272.00', 'Total yearly payment|£1,234.00'])
  })

  it('shows the total alone when there are no agreement-level items', () => {
    const $ = renderPage(model)
    const summary = cards($).last()

    expect(summary.find('.govuk-summary-list__row')).toHaveLength(1)
    expect(normalise(summary.find('.govuk-summary-list__key').text())).toBe('Total yearly payment')
    expect(normalise(summary.find('.govuk-summary-list__value').text())).toBe('£1,234.00')
  })

  it('renders the parcel subtotal and the application total with values', () => {
    const $ = renderPage(model)
    const text = bodyText($)
    expect(text).toContain('Subtotal')
    expect(text).toContain('£30.00')
    expect(text).toContain('Total yearly payment')
    expect(text).toContain('£1,234.00')
  })

  it('keeps the application total in its own card, outside every parcel card', () => {
    const $ = renderPage(model)
    const summary = cards($).last()

    expect(summary.find('.govuk-table')).toHaveLength(0)
    expect(summary.find('.govuk-summary-card__actions')).toHaveLength(0)
    expect(bodyText($)).not.toContain('Yearly payment for this parcel')
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
      expect(cards($)).toHaveLength(0)
      expect($('.govuk-table')).toHaveLength(0)
      expect($('form button, form input[type="submit"]')).toHaveLength(0)
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

  describe('no land parcels', () => {
    const emptyModel = {
      pageTitle: 'Your land and actions',
      hasNoLandParcels: true,
      hasCalculationError: false,
      selectLandParcelHref: '/test-grant/select-land-parcel'
    }

    it('explains nothing has been added and links to the parcel picker', () => {
      const $ = renderPage(emptyModel)

      expect(bodyText($)).toContain('You have not added any land parcels or actions yet.')
      const link = $('main a').filter((_, el) => normalise($(el).text()) === 'Select a land parcel and add actions')
      expect(link).toHaveLength(1)
      expect(link.attr('href')).toBe('/test-grant/select-land-parcel')
      expect(link.hasClass('govuk-link')).toBe(true)
    })

    it('omits the payment tables, buttons and error summary', () => {
      const $ = renderPage(emptyModel)

      expect(cards($)).toHaveLength(0)
      expect($('.govuk-table')).toHaveLength(0)
      expect($('form')).toHaveLength(0)
      expect($('.govuk-error-summary')).toHaveLength(0)
    })

    it('announces the removal that emptied the application above the H1', () => {
      const $ = renderPage({
        ...emptyModel,
        landParcelRemovalSuccessMessage: 'Far Meadow and its actions have been removed.'
      })

      const banner = $('main .govuk-notification-banner')
      expect(banner.hasClass('govuk-notification-banner--success')).toBe(true)
      expect(normalise(banner.find('.govuk-notification-banner__heading').text())).toBe(
        'Far Meadow and its actions have been removed.'
      )
      expect(banner.nextAll('h1')).toHaveLength(1)
    })

    it('tells the user the removal emptied the application, and what to do next', () => {
      const $ = renderPage({
        ...emptyModel,
        landParcelRemovalSuccessMessage: 'Far Meadow and its actions have been removed.'
      })

      expect(bodyText($)).toContain(
        'You removed the last land parcel. You must add at least one land parcel to continue your application.'
      )
      expect(bodyText($)).not.toContain('You have not added any land parcels or actions yet.')
      const link = $('main a').filter((_, el) => normalise($(el).text()) === 'Select a land parcel and add actions')
      expect(link).toHaveLength(1)
      expect(link.attr('href')).toBe('/test-grant/select-land-parcel')
    })

    it('renders the empty copy without a banner when no removal preceded it', () => {
      const $ = renderPage(emptyModel)

      expect($('main .govuk-notification-banner')).toHaveLength(0)
      expect(bodyText($)).toContain('You have not added any land parcels or actions yet.')
    })

    it('keeps the priced parcel cards when a removal left parcels behind', () => {
      const $ = renderPage({
        ...model,
        landParcelRemovalSuccessMessage: 'Far Meadow and its actions have been removed.'
      })

      expect($('main .govuk-notification-banner')).toHaveLength(1)
      expect(cards($)).toHaveLength(3)
      expect(bodyText($)).not.toContain('You have not added any land parcels or actions yet.')
    })

    it('keeps the H1 caption in both states', () => {
      const $ = renderPage(emptyModel)

      expect(normalise($('h1 span.govuk-caption-l').text())).toBe('Select land and actions')
    })
  })
})
