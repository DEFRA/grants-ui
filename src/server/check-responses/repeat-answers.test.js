import { randomUUID } from 'node:crypto'
import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import CheckResponsesPageController from './check-responses.controller.js'
import { createPageRenderer } from '../common/test-helpers/component-helpers.js'

vi.unmock('@defra/forms-model')
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () =>
  vi.importActual('@defra/forms-engine-plugin/engine/pageControllers/SummaryPageController.js')
)

const render = createPageRenderer(import.meta.url, 'check-responses-page.html', {}, [
  'src/server/check-responses/views'
])
const normalise = (value) => value.replace(/\s+/g, ' ').trim()

function createSummary({ sections = true, force = false } = {}) {
  const model = new FormModel(
    {
      name: 'Repeat answers test',
      engine: 'V2',
      startPage: '/before',
      sections: sections
        ? [
            { name: 'water', title: 'Water storage' },
            { name: 'other', title: 'Other details' }
          ]
        : [],
      lists: [
        {
          name: 'linings',
          title: 'Reservoir linings',
          type: 'string',
          items: [
            { text: 'Clay lining', value: 'clay' },
            { text: 'Synthetic lining', value: 'synthetic' }
          ]
        }
      ],
      conditions: [],
      metadata: {
        pageConfig: {
          '/summary': {
            additionalSections: [
              { page: '/after', items: [{ title: 'Calculated total', stateValue: 'additionalAnswers.total' }] }
            ]
          }
        }
      },
      pages: [
        {
          path: '/before',
          title: 'Before repeats',
          section: sections ? 'water' : undefined,
          components: [{ type: 'TextField', name: 'before', title: 'Before repeats' }]
        },
        {
          path: '/reservoirs',
          title: 'Reservoir details',
          section: sections ? 'water' : undefined,
          controller: 'RepeatPageController',
          repeat: { options: { name: 'reservoirs', title: 'Reservoir' }, schema: { min: 1, max: 5 } },
          components: [
            { type: 'TextField', name: 'name', title: 'Reservoir name' },
            { type: 'NumberField', name: 'capacity', title: 'Storage capacity' },
            { type: 'RadiosField', name: 'lining', title: 'Lining', list: 'linings' },
            { type: 'YesNoField', name: 'covered', title: 'Covered' },
            { type: 'DatePartsField', name: 'built', title: 'Date built' },
            { type: 'MultilineTextField', name: 'notes', title: 'Notes', options: { required: false } },
            { type: 'Html', content: '<p>Help for entering reservoir details</p>' }
          ]
        },
        {
          path: '/after',
          title: 'After repeats',
          section: sections ? 'water' : undefined,
          components: [{ type: 'TextField', name: 'after', title: 'After repeats' }]
        },
        {
          path: '/tanks',
          title: 'Tank details',
          section: sections ? 'other' : undefined,
          controller: 'RepeatPageController',
          repeat: { options: { name: 'tanks', title: 'Tank' }, schema: { min: 1, max: 5 } },
          components: [{ type: 'TextField', name: 'tankName', title: 'Tank name' }]
        },
        { path: '/summary', title: 'Check your answers', controller: 'CheckResponsesPageController', components: [] }
      ]
    },
    { basePath: 'grant' },
    { formsService: { getFormMetadata: async () => ({}) } },
    { CheckResponsesPageController }
  )
  const state = {
    $$__referenceNumber: 'test-reference',
    before: 'First answer',
    after: 'Last answer',
    reservoirs: [
      {
        itemId: randomUUID(),
        name: 'North reservoir',
        capacity: 0,
        lining: 'clay',
        covered: false,
        built__day: 1,
        built__month: 11,
        built__year: 2026,
        notes: 'First line\nSecond line'
      },
      {
        itemId: randomUUID(),
        name: 'South reservoir',
        capacity: 200000,
        lining: 'synthetic',
        covered: true,
        built__day: 2,
        built__month: 11,
        built__year: 2026,
        notes: null
      }
    ],
    tanks: [{ itemId: randomUUID(), tankName: 'Rainwater tank' }]
  }
  const request = {
    method: 'get',
    path: '/grant/summary',
    url: new URL('http://localhost/grant/summary'),
    query: force ? { force: '' } : {},
    params: { slug: 'grant', path: 'summary' },
    app: { model },
    server: { plugins: { 'forms-engine-plugin': {} } }
  }
  const context = model.getFormContext(request, state)
  const summaryPage = model.pageMap.get('/summary')
  return {
    model,
    context,
    state,
    view: () => render(summaryPage.getSummaryViewModel(request, context))
  }
}

describe('repeat answers on Check answers with the forms engine', () => {
  it('renders every field of every repeat page in item cards and preserves answer order', () => {
    const $ = createSummary().view()
    const cards = $('.govuk-summary-card')
    expect(cards.map((_, card) => normalise($(card).find('.govuk-summary-card__title').text())).get()).toEqual([
      'Reservoir 1',
      'Reservoir 2',
      'Tank 1'
    ])
    expect(
      cards
        .first()
        .find('.govuk-summary-list__row')
        .map((_, row) => [
          normalise($(row).find('dt').text()),
          normalise($(row).find('.govuk-summary-list__value').text())
        ])
        .get()
    ).toEqual([
      'Reservoir name',
      'North reservoir',
      'Storage capacity',
      '0',
      'Lining',
      'Clay lining',
      'Covered',
      'No',
      'Date built',
      '1 November 2026',
      'Notes (optional)',
      'First lineSecond line'
    ])
    expect(cards.eq(1).text()).toContain('South reservoir')
    expect(cards.eq(1).text()).toContain('Synthetic lining')
    expect(cards.eq(1).text()).toContain('Not provided')
    expect(cards.eq(2).find('dt').text().trim()).toBe('Tank name')
    expect(cards.eq(2).text()).toContain('Rainwater tank')
    expect(cards.first().find('.govuk-summary-list__row').last().find('dd').html()).toMatch(
      /First line<br>\s*Second line/
    )
    const content = $('main').text()
    expect(content.indexOf('First answer')).toBeLessThan(content.indexOf('Reservoir 1'))
    expect(content.indexOf('Reservoir 2')).toBeLessThan(content.indexOf('Last answer'))
    expect(content).not.toContain('You have added')
    expect(content).not.toContain('Help for entering')
    expect(cards.first().find('h3.govuk-summary-card__title')).toHaveLength(1)
    expect(cards.find('dl dl, table')).toHaveLength(0)
  })

  it('links each item to its repeat list with a return to Check answers and an accessible name', () => {
    const journey = createSummary()
    const $ = journey.view()
    const links = $('.govuk-summary-card__actions a')
    expect(links.map((_, link) => $(link).attr('href')).get()).toEqual([
      '/grant/reservoirs/summary?returnUrl=%2Fgrant%2Fsummary',
      '/grant/reservoirs/summary?returnUrl=%2Fgrant%2Fsummary',
      '/grant/tanks/summary?returnUrl=%2Fgrant%2Fsummary'
    ])
    expect(normalise(links.first().text())).toBe('Change (Reservoir 1)')
    expect(links).toHaveLength(3)
  })

  it('uses h2 card headings without section headings and omits Change in previews', () => {
    const $ = createSummary({ sections: false, force: true }).view()
    expect($('h2.govuk-summary-card__title')).toHaveLength(3)
    expect($('.govuk-summary-card a')).toHaveLength(0)
  })

  it('uses relevant state and excludes repeat pages outside the relevant journey', () => {
    const journey = createSummary()
    journey.context.relevantPages = journey.context.relevantPages.filter((page) => page.path !== '/tanks')
    delete journey.context.relevantState.tanks
    journey.context.relevantState.reservoirs = journey.state.reservoirs.slice(0, 1)
    const $ = journey.view()
    expect($('.govuk-summary-card')).toHaveLength(1)
    expect($('main').text()).not.toContain('South reservoir')
    expect($('main').text()).not.toContain('Rainwater tank')
  })

  it.each([[], undefined, 'invalid'])('shows an unavailable relevant repeat list (%j) as Not provided', (tanks) => {
    const journey = createSummary()
    journey.context.relevantState.tanks = tanks
    const $ = journey.view()
    expect($('.govuk-summary-card')).toHaveLength(2)
    const emptyAnswer = $('.check-answers-summary > .govuk-summary-list > .govuk-summary-list__row').last()
    expect(normalise(emptyAnswer.find('dt').text())).toBe('Tank')
    expect(normalise(emptyAnswer.find('.govuk-summary-list__value').text())).toBe('Not provided')
    expect(emptyAnswer.find('a').attr('href')).toContain('/grant/tanks/summary')
    expect($('main').text()).not.toContain('You have added')
  })

  it('preserves additional calculated answers alongside repeat cards', () => {
    const journey = createSummary()
    journey.state.additionalAnswers = { total: 123 }
    const $ = journey.view()
    expect($('.govuk-summary-card')).toHaveLength(3)
    const additionalRow = $('.check-answers-summary > .govuk-summary-list > .govuk-summary-list__row').last()
    expect(normalise(additionalRow.find('dt').text())).toBe('Calculated total')
    expect(normalise(additionalRow.find('.govuk-summary-list__value').text())).toBe('123')
  })

  it('escapes user-entered markup while retaining multiline formatting', () => {
    const journey = createSummary()
    journey.state.reservoirs[0].name = '<img src=x onerror=alert(1)>'
    journey.state.reservoirs[0].notes = '<script>alert(1)</script>\nA & B'
    const $ = journey.view()
    const card = $('.govuk-summary-card').first()
    expect(card.find('img, script')).toHaveLength(0)
    expect(card.text()).toContain('<img src=x onerror=alert(1)>')
    expect(card.text()).toContain('<script>alert(1)</script>')
    expect(card.text()).toContain('A & B')
  })
})
