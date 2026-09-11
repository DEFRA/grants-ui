import { describe, expect, it } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'
import { buildPrintViewModel } from '~/src/server/common/helpers/print-application-service/print-application-service.js'

const renderPage = createPageRenderer(import.meta.url, 'print-submitted-application.html')
const normalise = (text) => text.replace(/\s+/g, ' ').trim()
const payment = {
  annualTotalPence: 37200,
  parcelItems: {
    1: {
      sheetId: 'SD1234',
      parcelId: '5678',
      code: 'CLIG3',
      description: 'Action description',
      quantity: 2,
      unit: 'ha',
      annualPaymentPence: 10000
    }
  },
  agreementLevelItems: {
    1: { code: 'CMOR1', description: 'Assess moorland', annualPaymentPence: 27200 }
  }
}
const params = {
  definition: {
    pages: [
      {
        title: 'Land and actions',
        controller: 'MapSelectPageController',
        components: [{ type: 'TextField', name: 'selectedParcelsDisplay', title: 'Selected parcels' }]
      },
      {
        title: 'Other answers',
        components: [
          { type: 'TextField', name: 'landParcels', title: 'Land parcels' },
          { type: 'TextField', name: 'projectName', title: 'Project name' }
        ]
      }
    ]
  },
  answers: {
    selectedParcelsDisplay: 'SD1234-5678',
    landParcels: { 'SD1234-5678': { actionsObj: { CLIG3: { consents: ['sssi'] } } } },
    projectName: 'Test project',
    payment,
    agreementStartDate: '2026-01-01',
    agreementEndDate: '2028-12-31',
    agreementTotalPence: 111600
  },
  form: { name: 'Test grant' },
  slug: 'test-grant',
  referenceNumber: 'REF-123',
  submittedAt: '2026-09-07T10:30:00.000Z',
  sessionData: {}
}

describe('print-submitted-application.html view', () => {
  it.each(['Select land and actions', 'Choose parcels and actions'])(
    'renders land and payment cards once under the configured task title %s',
    (taskTitle) => {
      const $ = renderPage(
        buildPrintViewModel({
          ...params,
          definition: {
            sections: [
              { id: 'land', title: taskTitle },
              { id: 'other', title: 'Other task' }
            ],
            pages: [
              { title: 'Tasks', controller: 'TaskListPageController' },
              { ...params.definition.pages[0], section: 'land' },
              { ...params.definition.pages[1], section: 'other' }
            ]
          }
        })
      )

      const headings = $('main h2.govuk-heading-m')
      expect(headings.map((_, heading) => $(heading).text()).get()).toEqual([taskTitle, 'Other task'])
      expect(headings.first().nextUntil('h2.govuk-heading-m').filter('.govuk-summary-card')).toHaveLength(2)
      expect($('.govuk-summary-card')).toHaveLength(2)
      expect(normalise($('main').text())).not.toContain('Selected parcels SD1234-5678')
    }
  )

  it('groups answers from multiple pages under their task names in task order', () => {
    const questionPage = (section, name) => ({
      title: `Page ${name}`,
      section,
      components: [{ type: 'TextField', name, title: `Question ${name}` }]
    })
    const $ = renderPage(
      buildPrintViewModel({
        ...params,
        definition: {
          sections: [
            { id: 'second', title: 'Second task' },
            { id: 'first', title: 'First task' },
            { id: 'empty', title: 'Empty task' }
          ],
          pages: [
            { title: 'Tasks', controller: 'TaskListPageController' },
            questionPage('first', 'one'),
            questionPage('second', 'two'),
            questionPage('first', 'three'),
            questionPage('empty', 'unanswered')
          ]
        },
        answers: { one: 'Answer one', two: 'Answer two', three: 'Answer three' }
      })
    )

    expect(
      $('main h2')
        .map((_, heading) => $(heading).text())
        .get()
    ).toEqual(['First task', 'Second task'])
    expect(normalise($('main h2').first().next().text())).toBe('Question one Answer one Question three Answer three')
    expect(normalise($('main h2').last().next().text())).toBe('Question two Answer two')
    expect($('main').text()).not.toContain('Submitted answers')
  })

  it('retains answers without a matching task under Submitted answers', () => {
    const $ = renderPage(
      buildPrintViewModel({
        ...params,
        definition: {
          pages: [{ title: 'Tasks', controller: 'TaskListPageController' }, ...params.definition.pages]
        },
        answers: { projectName: 'Test project' }
      })
    )

    expect($('main h2').text()).toBe('Submitted answers')
    expect(normalise($('main h2').next().text())).toBe('Project name Test project')
  })

  it('replaces parcel reference answers and the old tables with shared cards without editing links', () => {
    const $ = renderPage(buildPrintViewModel(params))
    const parcelCard = $('.govuk-summary-card').first()
    const content = normalise($('main').text())

    expect(normalise(parcelCard.find('.govuk-summary-card__title').text())).toBe('Parcel reference SD1234 5678')
    expect(
      parcelCard
        .find('thead th')
        .map((_, th) => normalise($(th).text()))
        .get()
    ).toEqual(['Action', 'Quantity', 'Yearly payment'])
    expect(parcelCard.find('colgroup col')).toHaveLength(3)
    expect(normalise(parcelCard.find('tbody tr').first().text())).toBe(
      'Action description (CLIG3) Requires SSSI consent 2.0000 ha £100.00'
    )
    expect(normalise(parcelCard.find('tbody tr').last().text())).toBe('Subtotal £100.00')
    expect($('.govuk-summary-card a')).toHaveLength(0)
    expect(content).toContain('Project name Test project')
    expect(content).toContain('Submitted answers')
    expect(content).not.toContain('Selected parcels')
    expect(content).not.toContain('Land parcels')
    expect(content).not.toContain('Parcel based actions')
    expect(content).toContain('Application number: REF-123')
    expect(content).toContain('Submitted on 7 September 2026')
    expect($('#print-button')).toHaveLength(1)
  })

  it('renders additional payments, the annual total and agreement details from submitted state', () => {
    const $ = renderPage(buildPrintViewModel(params))
    const paymentCard = $('.govuk-summary-card').last()

    expect(normalise(paymentCard.find('.govuk-summary-card__title').text())).toBe('Payment summary')
    expect(
      paymentCard
        .find('.govuk-summary-list__row')
        .map((_, row) => normalise($(row).text()))
        .get()
    ).toEqual([
      'Assess moorland (CMOR1) £272.00',
      'Total yearly payment £372.00',
      'Agreement duration 3 years',
      'Estimated payment over 3 years £1,116.00'
    ])
  })

  it('supports agreement details stored within payment and agreement-only payments', () => {
    const $ = renderPage(
      buildPrintViewModel({
        ...params,
        answers: {
          selectedParcelsDisplay: 'SD1234-5678',
          landParcels: ['SD1234-5678'],
          payment: {
            ...payment,
            parcelItems: {},
            annualTotalPence: 27200,
            agreementStartDate: '2026-01-01',
            agreementEndDate: '2028-12-31',
            agreementTotalPence: 81600
          }
        }
      })
    )

    expect($('.govuk-summary-card')).toHaveLength(1)
    expect(normalise($('.govuk-summary-card').text())).toContain('Estimated payment over 3 years £816.00')
    expect(normalise($('main').text())).toContain('Selected parcels SD1234-5678')
    expect(normalise($('main').text())).toContain('Land parcels ["SD1234-5678"]')
  })

  it('renders Woodland answers when the saved calculation is a single payment', () => {
    const $ = renderPage(
      buildPrintViewModel({
        ...params,
        answers: {
          selectedParcelsDisplay: 'SD1234-5678',
          landParcels: ['SD1234-5678'],
          projectName: 'Woodland management plan',
          payment: {
            frequency: 'Single',
            agreementStartDate: '2026-01-01',
            agreementEndDate: '2035-12-31',
            agreementTotalPence: 300000,
            parcelItems: {},
            agreementLevelItems: {
              1: {
                code: 'PA3',
                description: 'Woodland management plan',
                quantity: 50,
                agreementTotalPence: 300000,
                unit: 'ha'
              }
            },
            payments: [{ totalPaymentPence: 300000, paymentDate: null }]
          }
        }
      })
    )

    const content = normalise($('main').text())
    expect(content).toContain('Project name Woodland management plan')
    expect(content).toContain('Selected parcels SD1234-5678')
    expect(content).toContain('Land parcels ["SD1234-5678"]')
    expect($('.govuk-summary-card')).toHaveLength(0)
    expect($('#print-button')).toHaveLength(1)
  })

  it('keeps the compact parcel answers when no payment calculation was saved', () => {
    const $ = renderPage(
      buildPrintViewModel({
        ...params,
        answers: { selectedParcelsDisplay: 'SD1234-5678', landParcels: ['SD1234-5678'] }
      })
    )

    expect($('.govuk-summary-card')).toHaveLength(0)
    expect(normalise($('main').text())).toContain('Selected parcels SD1234-5678')
    expect(normalise($('main').text())).toContain('Land parcels ["SD1234-5678"]')
  })
})
