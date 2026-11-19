import { describe, expect, it } from 'vitest'
import { createPageRenderer } from '~/src/server/common/test-helpers/component-helpers.js'
import {
  buildPrintViewModel,
  enrichDefinitionWithListItems
} from '~/src/server/common/helpers/print-application-service/print-application-service.js'

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
    projectName: 'Test project'
  },
  savedState: {
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
  it.each([true, false])(
    'renders saved map hints in normal weight when the journey has a task list: %s',
    (hasTaskList) => {
      const components = [
        {
          name: 'grid',
          type: 'EastingNorthingField',
          title: 'Grid coordinates',
          options: { showApproximateLocation: true }
        },
        {
          name: 'point',
          type: 'LatLongField',
          title: 'Latitude and longitude',
          options: { showApproximateLocation: true }
        },
        {
          name: 'reference',
          type: 'OsGridRefField',
          title: 'Grid reference',
          options: { showApproximateLocation: true }
        }
      ]
      const answers = {
        grid__easting: 432100,
        grid__northing: 556200,
        point: { latitude: 51.5, longitude: 0 },
        reference: 'tq 30000 80000',
        mapLocationHints: {
          grid: { text: 'Approximate location: Washington', answer: '[432100,556200]' },
          point: { text: 'Nearby: London', answer: '[51.5,0]' },
          reference: { text: '<em>Nearby:</em> <img src=x onerror=alert(1)>', answer: '["TQ3000080000"]' }
        }
      }
      const $ = renderPage(
        buildPrintViewModel({
          ...params,
          definition: {
            sections: [{ id: 'project', title: 'Project details' }],
            pages: [
              ...(hasTaskList ? [{ title: 'Tasks', controller: 'TaskListPageController' }] : []),
              { title: 'Project location', section: 'project', components }
            ]
          },
          answers: {
            grid__easting: answers.grid__easting,
            grid__northing: answers.grid__northing,
            point: answers.point,
            reference: answers.reference
          },
          savedState: answers
        })
      )
      const rows = $('.app-submitted-answers .govuk-summary-list__value')
      expect(rows.eq(0).text()).toContain('432100, 556200')
      expect(rows.eq(1).text()).toContain('51.5, 0')
      expect(rows.eq(2).text()).toContain('tq 30000 80000')
      for (const [index, name] of ['grid', 'point', 'reference'].entries()) {
        expect(rows.eq(index).find('p').text()).toBe(answers.mapLocationHints[name].text)
      }
      expect(rows.find('strong, b, em, img')).toHaveLength(0)
      expect($('.app-submitted-answers a')).toHaveLength(0)
    }
  )

  it.each([
    { setting: undefined, hint: { text: 'Hidden location', answer: '[432100,556200]' } },
    { setting: false, hint: { text: 'Hidden location', answer: '[432100,556200]' } },
    { setting: true, hint: undefined },
    { setting: true, hint: { text: 'Stale location', answer: '[432101,556200]' } },
    { setting: true, hint: { text: 'Wrong answer type', answer: undefined } }
  ])('omits disabled, missing and stale hints while retaining coordinates (%j)', ({ setting, hint }) => {
    const $ = renderPage(
      buildPrintViewModel({
        ...params,
        definition: {
          pages: [
            {
              title: 'Project location',
              components: [
                {
                  name: 'location',
                  type: 'EastingNorthingField',
                  title: 'Location',
                  options: { showApproximateLocation: setting }
                }
              ]
            }
          ]
        },
        answers: {
          location__easting: 432100,
          location__northing: 556200
        },
        savedState: { mapLocationHints: { location: hint } }
      })
    )
    const row = $('.app-submitted-answers .govuk-summary-list__value').first()
    expect(normalise(row.text())).toBe('432100, 556200')
    expect(row.find('p')).toHaveLength(0)
  })

  describe('saved repeat items', () => {
    function repeatParams(hasTaskList = true) {
      return {
        ...params,
        savedState: {},
        definition: enrichDefinitionWithListItems({
          sections: [{ id: 'water', title: 'Water storage' }],
          lists: [{ id: 'lining-options', items: [{ text: 'Clay lining', value: 'clay' }] }],
          pages: [
            ...(hasTaskList ? [{ title: 'Tasks', controller: 'TaskListPageController' }] : []),
            {
              path: '/before',
              title: 'Before repeats',
              section: 'water',
              components: [{ type: 'TextField', name: 'before', title: 'Before repeats' }]
            },
            {
              path: '/reservoirs',
              title: 'Reservoir details',
              controller: 'RepeatPageController',
              section: 'water',
              repeat: { options: { name: 'reservoirItems', title: 'Reservoir' } },
              components: [
                { type: 'TextField', name: 'name', title: 'Reservoir name' },
                { type: 'NumberField', name: 'capacity', title: 'Storage capacity' },
                { type: 'RadiosField', name: 'lining', title: 'Lining', list: 'lining-options' },
                { type: 'YesNoField', name: 'covered', title: 'Covered' },
                { type: 'DatePartsField', name: 'built', title: 'Date built' },
                { type: 'MultilineTextField', name: 'notes', title: 'Notes', options: { required: false } },
                { type: 'Html', name: 'help', title: 'Help text' },
                { type: 'TextField', name: '$$internal', title: 'Internal' }
              ]
            },
            {
              path: '/after',
              title: 'After repeats',
              section: 'water',
              components: [{ type: 'TextField', name: 'after', title: 'After repeats' }]
            },
            {
              path: '/tanks',
              title: 'Tank details',
              controller: 'RepeatPageController',
              section: 'water',
              repeat: { options: { name: 'tanks', title: 'Tank' } },
              components: [{ type: 'TextField', name: 'tankName', title: 'Tank name' }]
            }
          ]
        }),
        answers: {
          before: 'First saved answer',
          after: 'Last saved answer',
          name: 'Stale top-level reservoir',
          tankName: 'Stale top-level tank',
          reservoirItems: [
            {
              itemId: 'first-reservoir',
              name: 'North reservoir',
              capacity: 0,
              lining: 'clay',
              covered: false,
              built__day: 1,
              built__month: 11,
              built__year: 2026,
              notes: 'First line\nSecond line',
              help: 'Help text',
              $$internal: 'Internal value'
            },
            { itemId: 'second-reservoir', name: 'South reservoir', capacity: 200000, covered: true, notes: null }
          ],
          tanks: [{ itemId: 'first-tank', tankName: 'Rainwater tank' }]
        }
      }
    }

    it.each([true, false])('hides populated and unanswered hidden fields with task grouping=%s', (hasTaskList) => {
      const saved = repeatParams(hasTaskList)
      const hiddenFields = [
        { type: 'HiddenField', name: 'secret', title: 'Hidden label' },
        { type: 'HiddenField', name: 'blank', title: 'Blank hidden label' }
      ]
      saved.definition.pages.find((page) => page.path === '/before').components.push(...hiddenFields)
      saved.definition.pages.find((page) => page.path === '/reservoirs').components.push(...hiddenFields)
      saved.answers.secret = 'Top-level hidden value'
      saved.answers.blank = null
      saved.answers.reservoirItems[0].secret = 'First hidden item value'
      saved.answers.reservoirItems[0].blank = null
      saved.answers.reservoirItems[1].secret = 'Second hidden item value'
      const originalAnswers = structuredClone(saved.answers)

      const $ = renderPage(buildPrintViewModel(saved))
      const content = normalise($('main').text())
      expect(content).not.toContain('Hidden label')
      expect(content).not.toContain('Blank hidden label')
      expect(content).not.toContain('Top-level hidden value')
      expect(content).not.toContain('First hidden item value')
      expect(content).not.toContain('Second hidden item value')
      expect(content).toContain('First saved answer')
      expect(content).toContain('Reservoir name North reservoir')
      expect($('.govuk-summary-card')).toHaveLength(3)
      expect($('.govuk-summary-card').first().find('.govuk-summary-list__row')).toHaveLength(6)
      expect(saved.answers).toEqual(originalAnswers)
    })

    it('omits hidden-only ordinary pages and repeat cards', () => {
      const saved = repeatParams(false)
      saved.definition.pages.find((page) => page.path === '/before').components[0].type = 'HiddenField'
      saved.definition.pages.find((page) => page.path === '/tanks').components[0].type = 'HiddenField'

      const $ = renderPage(buildPrintViewModel(saved))
      expect($('.govuk-summary-card')).toHaveLength(2)
      expect($('main').text()).not.toContain('First saved answer')
      expect($('main').text()).not.toContain('Tank 1')
      expect($('main').text()).not.toContain('Rainwater tank')
      expect($('main').text()).toContain('Last saved answer')
    })

    it('excludes notification banners from repeat item answers even when unanswered fields are included', () => {
      const saved = repeatParams()
      saved.definition.pages
        .find((page) => page.path === '/reservoirs')
        .components.push({
          type: 'NotificationBanner',
          name: 'notice',
          title: 'Important'
        })

      const $ = renderPage(buildPrintViewModel(saved))
      const labels = $('.app-submitted-answers .govuk-summary-list__key')
        .map((_, key) => normalise($(key).text()))
        .get()

      expect(labels).not.toContain('Important')
      expect(labels.filter((label) => label === 'Reservoir name')).toHaveLength(2)
      expect(normalise($('main').text())).toContain('North reservoir')
      expect(normalise($('main').text())).toContain('South reservoir')
    })

    it.each([true, false])('renders all item fields in order with task grouping: %s', (hasTaskList) => {
      const saved = repeatParams(hasTaskList)
      const originalAnswers = structuredClone(saved.answers)
      const $ = renderPage(buildPrintViewModel(saved))
      const cards = $('.govuk-summary-card')
      expect(
        cards
          .find('h3')
          .map((_, title) => $(title).text().trim())
          .get()
      ).toEqual(['Reservoir 1', 'Reservoir 2', 'Tank 1'])
      expect(
        cards
          .first()
          .find('.govuk-summary-list__row')
          .map((_, row) => normalise($(row).text()))
          .get()
      ).toEqual([
        'Reservoir name North reservoir',
        'Storage capacity 0',
        'Lining Clay lining',
        'Covered No',
        'Date built 1 November 2026',
        'Notes (optional) First line Second line'
      ])
      expect(
        cards
          .eq(1)
          .find('.govuk-summary-list__row')
          .map((_, row) => normalise($(row).text()))
          .get()
      ).toEqual([
        'Reservoir name South reservoir',
        'Storage capacity 200000',
        'Lining Not provided',
        'Covered Yes',
        'Date built Not provided',
        'Notes (optional) Not provided'
      ])
      expect(normalise(cards.last().text())).toBe('Tank 1 Tank name Rainwater tank')
      const content = $('main').text()
      expect(content.indexOf('First saved answer')).toBeLessThan(content.indexOf('Reservoir 1'))
      expect(content.indexOf('Reservoir 2')).toBeLessThan(content.indexOf('Last saved answer'))
      expect(content.indexOf('Last saved answer')).toBeLessThan(content.indexOf('Tank 1'))
      expect(content).not.toContain('Stale top-level')
      expect(content).not.toContain('Help text')
      expect(content).not.toContain('Internal value')
      expect(content).not.toContain('You have added')
      expect(cards.find('a, table, dl dl')).toHaveLength(0)
      expect(cards.find('.app-submitted-answers')).toHaveLength(3)
      expect(cards.first().find('br')).toHaveLength(1)
      expect($('main h2').text()).toBe(hasTaskList ? 'Water storage' : 'Submitted answers')
      expect(saved.answers).toEqual(originalAnswers)
    })

    it('omits repeat pages outside the relevant journey even when saved items exist', () => {
      const saved = repeatParams()
      const $ = renderPage(
        buildPrintViewModel({
          ...saved,
          savedState: saved.answers,
          answers: { reservoirItems: saved.answers.reservoirItems }
        })
      )
      expect($('.govuk-summary-card')).toHaveLength(2)
      expect($('main').text()).not.toContain('Rainwater tank')
    })

    it.each([true, false])('uses relevant state for answer rows with task grouping: %s', (hasTaskList) => {
      const saved = repeatParams(hasTaskList)
      const relevantState = { before: saved.answers.before, reservoirItems: saved.answers.reservoirItems }
      const $ = renderPage(buildPrintViewModel({ ...saved, answers: relevantState, savedState: saved.answers }))

      expect($('.govuk-summary-card')).toHaveLength(2)
      expect($('main').text()).toContain('First saved answer')
      expect($('main').text()).toContain('North reservoir')
      expect($('main').text()).toContain('South reservoir')
      expect($('main').text()).not.toContain('Last saved answer')
      expect($('main').text()).not.toContain('Rainwater tank')
    })

    it.each([
      ['empty', []],
      ['missing', undefined],
      ['invalid', 'invalid'],
      ['invalid items', [null]]
    ])('handles %s repeat collections', (_label, tanks) => {
      const saved = repeatParams()
      saved.answers.tanks = tanks
      const $ = renderPage(buildPrintViewModel(saved))
      expect($('.govuk-summary-card')).toHaveLength(2)
      expect($('main').text()).not.toContain('Tank name')
      expect($('main').text()).not.toContain('Stale top-level')
    })

    it('escapes item titles and values while preserving multiline answers', () => {
      const saved = repeatParams()
      saved.definition.pages.find((page) => page.path === '/reservoirs').repeat.options.title = '<b>Reservoir</b>'
      saved.answers.reservoirItems[0].name = '<img src=x onerror=alert(1)>'
      saved.answers.reservoirItems[0].notes = '<script>alert(1)</script>\nA & B'
      const $ = renderPage(buildPrintViewModel(saved))
      const card = $('.govuk-summary-card').first()
      expect(card.find('img, script, b')).toHaveLength(0)
      expect(card.find('h3').text().trim()).toBe('<b>Reservoir</b> 1')
      expect(card.text()).toContain('<img src=x onerror=alert(1)>')
      expect(card.text()).toContain('<script>alert(1)</script>')
      expect(card.text()).toContain('A & B')
      expect(card.find('br')).toHaveLength(1)
    })
  })

  it.each([true, false])('renders saved derived answers when the journey has a task list: %s', (hasTaskList) => {
    const $ = renderPage(
      buildPrintViewModel({
        ...params,
        definition: {
          sections: [{ id: 'project', title: 'Project details' }],
          pages: [
            ...(hasTaskList ? [{ title: 'Tasks', controller: 'TaskListPageController' }] : []),
            { path: '/score-results', title: 'Score results', section: 'project' },
            { path: '/total-estimated-cost', title: 'Total estimated cost', section: 'project' },
            { path: '/summary', title: 'Check answers', controller: 'CheckResponsesPageController' }
          ],
          metadata: {
            pageConfig: {
              '/summary': {
                additionalSections: [
                  { page: '/score-results', items: [{ title: 'Score', stateValue: 'additionalAnswers.totalScore' }] },
                  {
                    page: '/total-estimated-cost',
                    items: [{ title: 'Total estimated cost (£)', stateValue: 'additionalAnswers.totalEstimatedCost' }]
                  }
                ]
              }
            }
          }
        },
        savedState: { additionalAnswers: { totalScore: 0, totalEstimatedCost: 125000 } }
      })
    )

    const rows = $('.app-submitted-answers .govuk-summary-list__row')
    expect(rows).toHaveLength(2)
    expect(normalise(rows.eq(0).text())).toBe('Score 0')
    expect(normalise(rows.eq(1).text())).toBe('Total estimated cost (£) 125000')
    expect($('a').filter((_, link) => $(link).text().includes('Change'))).toHaveLength(0)
  })

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
        answers: { one: 'Answer one', two: 'Answer two', three: 'Answer three' },
        savedState: {}
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
        answers: { projectName: 'Test project' },
        savedState: {}
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
    expect(normalise(parcelCard.find('tbody tr').first().text())).toBe(
      'Action description (CLIG3) SSSI consent required 2.0000 ha £100.00'
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
          landParcels: ['SD1234-5678']
        },
        savedState: {
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
          projectName: 'Woodland management plan'
        },
        savedState: {
          landParcels: ['SD1234-5678'],
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
        answers: { selectedParcelsDisplay: 'SD1234-5678', landParcels: ['SD1234-5678'] },
        savedState: {}
      })
    )

    expect($('.govuk-summary-card')).toHaveLength(0)
    expect(normalise($('main').text())).toContain('Selected parcels SD1234-5678')
    expect(normalise($('main').text())).toContain('Land parcels ["SD1234-5678"]')
  })
})
