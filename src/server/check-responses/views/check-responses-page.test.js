import { describe, expect, it } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'

const renderPage = createPageRenderer(import.meta.url, 'check-responses-page.html', {
  pageTitle: 'Check your answers',
  page: { model: { sections: [{}] } }
})

const landAndActionsSummary = {
  changeHref: '/test-grant/confirm-land-and-actions',
  parcels: [
    {
      reference: 'SD1234 5678',
      actions: [
        {
          action: 'Action description (CLIG3)',
          area: '2.0000 ha',
          yearlyPayment: '£100.00',
          changeHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678'
        }
      ],
      yearlyPayment: '£100.00',
      removeHref: 'remove-parcel?parcelId=SD1234-5678',
      addActionsHref: 'select-actions-for-land-parcel?parcelId=SD1234-5678'
    }
  ],
  additionalYearlyPayments: [{ action: 'Assess moorland (CMOR1)', yearlyPayment: '£272.00' }],
  applicationYearlyPayment: '£372.00',
  agreementDuration: '3 years',
  agreementDurationYears: 3,
  agreementTotalPayment: '£1,116.00'
}

const model = {
  checkAnswers: [
    {
      title: { text: 'Land and actions' },
      summaryList: { rows: [] },
      landAndActionsSummary
    }
  ]
}

const normalise = (text) => text.replace(/\s+/g, ' ').trim()

describe('check-responses-page.html view', () => {
  it('renders the shared parcel card with a three-column table', () => {
    const $ = renderPage(model)
    const parcelCard = $('.govuk-summary-card').first()

    expect(normalise(parcelCard.find('.govuk-summary-card__title').text())).toBe('Parcel reference SD1234 5678')
    expect(
      parcelCard
        .find('.govuk-table__head th')
        .map((_, header) => normalise($(header).text()))
        .get()
    ).toEqual(['Action', 'Quantity', 'Yearly payment'])
    expect(parcelCard.find('.govuk-table__body .govuk-table__row').first().find('th, td')).toHaveLength(3)
  })

  it('replaces parcel editing controls with the standard Change link back to confirmation', () => {
    const $ = renderPage(model)
    const parcelCard = $('.govuk-summary-card').first()
    const links = parcelCard.find('a')

    expect(links).toHaveLength(1)
    expect(links.attr('href')).toBe('/test-grant/confirm-land-and-actions')
    expect(normalise(links.text())).toBe('Change land parcel SD1234 5678 and actions')
    expect(normalise(parcelCard.text())).not.toContain('Remove parcel')
    expect(normalise(parcelCard.text())).not.toContain('Add more actions to this parcel')
  })

  it('renders the shared payment summary card after the parcel cards', () => {
    const $ = renderPage(model)
    const paymentCard = $('.govuk-summary-card').last()
    const summaryList = paymentCard.find('.govuk-summary-list')

    expect(normalise(paymentCard.find('.govuk-summary-card__title').text())).toBe('Payment summary')
    expect(summaryList.hasClass('govuk-summary-list--no-border')).toBe(false)
    expect(
      summaryList
        .find('.govuk-summary-list__row')
        .map((_, row) =>
          [
            normalise($(row).find('.govuk-summary-list__key').text()),
            normalise($(row).find('.govuk-summary-list__value').text())
          ].join('|')
        )
        .get()
    ).toEqual([
      'Assess moorland (CMOR1)|£272.00',
      'Total yearly payment|£372.00',
      'Agreement duration|3 years',
      'Estimated payment over 3 years|£1,116.00'
    ])
  })
})
