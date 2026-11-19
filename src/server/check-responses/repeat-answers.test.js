import { randomUUID } from 'node:crypto'
import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import CheckResponsesPageController from './check-responses.controller.js'
import { createPageRenderer } from '../common/test-helpers/component-helpers.js'
import { validateNumberFormats } from '../common/forms/validate-number-formats.js'
import { buildPrintViewModel } from '../common/helpers/print-application-service/print-application-service.js'
import { HTML_INJECTION } from '~/src/__mocks__/escape-mocks.js'

vi.unmock('@defra/forms-model')
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () =>
  vi.importActual('@defra/forms-engine-plugin/engine/pageControllers/SummaryPageController.js')
)

const render = createPageRenderer(import.meta.url, 'check-responses-page.html', {}, [
  'src/server/check-responses/views'
])
const renderPrint = createPageRenderer(import.meta.url, 'print-submitted-application.html', {}, [
  'src/server/print-submitted-application/views'
])
const normalise = (value) => value.replace(/\s+/g, ' ').trim()

function createSummary({ sections = true, force = false, withHiddenFields = false, hiddenOnly = false, format } = {}) {
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
          components: [
            ...(withHiddenFields
              ? [
                  { type: 'HiddenField', name: 'internal', title: 'Internal answer', options: { required: false } },
                  { type: 'HiddenField', name: 'blank', title: 'Blank hidden answer', options: { required: false } }
                ]
              : []),
            { type: 'TextField', name: 'before', title: 'Before repeats' }
          ]
        },
        {
          path: '/reservoirs',
          title: 'Reservoir details',
          section: sections ? 'water' : undefined,
          controller: 'RepeatPageController',
          repeat: { options: { name: 'reservoirs', title: 'Reservoir' }, schema: { min: 1, max: 5 } },
          components: [
            ...(withHiddenFields
              ? [
                  { type: 'HiddenField', name: 'internal', title: 'Internal answer', options: { required: false } },
                  { type: 'HiddenField', name: 'blank', title: 'Blank hidden answer', options: { required: false } }
                ]
              : []),
            { type: 'TextField', name: 'name', title: 'Reservoir name' },
            { type: 'NumberField', name: 'capacity', title: 'Storage capacity', options: { format } },
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
          components: hiddenOnly
            ? [{ type: 'HiddenField', name: 'tankName', title: 'Tank name' }]
            : [
                { type: 'TextField', name: 'tankName', title: 'Tank name' },
                { type: 'CheckboxesField', name: 'tankLinings', title: 'Tank linings', list: 'linings' },
                { type: 'FileUploadField', name: 'tankEvidence', title: 'Tank evidence', options: {}, schema: {} },
                { type: 'UkAddressField', name: 'tankAddress', title: 'Tank address', options: { required: false } },
                {
                  type: 'EastingNorthingField',
                  name: 'tankLocation',
                  title: 'Tank location',
                  options: { required: false }
                }
              ]
        },
        { path: '/summary', title: 'Check your answers', controller: 'CheckResponsesPageController', components: [] }
      ]
    },
    { basePath: 'grant' },
    { formsService: { getFormMetadata: async () => ({}) } },
    { CheckResponsesPageController }
  )
  validateNumberFormats(model.def)
  const state = {
    $$__referenceNumber: 'test-reference',
    ...(withHiddenFields ? { internal: 'Internal top-level value', blank: null } : {}),
    before: 'First answer',
    after: 'Last answer',
    reservoirs: [
      {
        itemId: randomUUID(),
        ...(withHiddenFields ? { internal: 'Internal first item', blank: null } : {}),
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
        ...(withHiddenFields ? { internal: 'Internal second item', blank: null } : {}),
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

/** Renders a journey's Check answers page and its print page. */
const renderBoth = (journey) => [
  journey.view(),
  renderPrint(
    buildPrintViewModel({
      definition: journey.model.def,
      form: journey.model.def,
      answers: journey.context.relevantState,
      savedState: journey.state,
      slug: 'grant',
      sessionData: {},
      submittedAt: '2026-11-12T10:00:00.000Z'
    })
  )
]

describe('repeat answers on Check answers with the forms engine', () => {
  it.each([false, true])(
    'hides ordinary and repeated hidden fields with preview=%s without changing engine data',
    (force) => {
      const journey = createSummary({ withHiddenFields: true, force })
      const originalState = structuredClone(journey.state)
      const originalFields = journey.model.pages.map((page) => [...page.collection.fields])
      const $ = journey.view()

      expect($('main').text()).not.toContain('Internal answer')
      expect($('main').text()).not.toContain('Blank hidden answer')
      expect($('main').text()).not.toContain('Internal top-level value')
      expect($('main').text()).not.toContain('Internal first item')
      expect($('main').text()).not.toContain('Internal second item')
      expect($('.govuk-summary-card')).toHaveLength(3)
      expect(normalise($('.check-answers-summary > dl dt').first().text())).toBe('Before repeats')
      expect($('.govuk-summary-card').first().find('.govuk-summary-list__row')).toHaveLength(6)
      expect(journey.state).toEqual(originalState)
      expect(journey.context.relevantState.internal).toBe('Internal top-level value')
      expect(journey.context.relevantState.reservoirs[0].internal).toBe('Internal first item')
      expect(journey.model.pages.map((page) => page.collection.fields)).toEqual(originalFields)
    }
  )

  it('omits repeat cards and section headings when every field in them is hidden', () => {
    const journey = createSummary({ hiddenOnly: true })
    const $ = journey.view()
    expect($('.govuk-summary-card')).toHaveLength(2)
    expect($('main').text()).not.toContain('Other details')
    expect($('main').text()).not.toContain('Tank name')
    expect($('main').text()).not.toContain('Tank 1')
    expect(journey.state.tanks[0].tankName).toBe('Rainwater tank')
  })

  it('formats each repeated currency answer on Check answers and print without changing saved numbers', () => {
    const journey = createSummary({ format: 'currency:gbp', withHiddenFields: true })
    journey.state.reservoirs[1].capacity = 200000.5
    const savedState = structuredClone(journey.state)

    for (const $ of renderBoth(journey)) {
      const amounts = $('.govuk-summary-list__row')
        .filter((_, row) => $(row).find('dt').text().trim() === 'Storage capacity')
        .map((_, row) => $(row).find('dd').text().trim())
        .get()
      expect(amounts).toEqual(['£0.00', '£200,000.50'])
      expect($('main').text()).not.toContain('Internal answer')
    }
    expect(journey.state).toEqual(savedState)
  })

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
    expect(
      cards
        .eq(2)
        .find('dt')
        .map((_, label) => $(label).text().trim())
        .get()
    ).toEqual(['Tank name', 'Tank linings', 'Tank evidence', 'Tank address (optional)', 'Tank location (optional)'])
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

  it('displays apostrophes in repeat answers on Check answers and print', () => {
    const journey = createSummary()
    journey.state.reservoirs[0].name = "Garry's pond"
    journey.state.reservoirs[1].name = "Gary's pond <script>alert('hi')</script>"
    journey.state.reservoirs[1].notes = "Garry's lake\nIt's deep"

    for (const $ of renderBoth(journey)) {
      const cards = $('.govuk-summary-card')
      expect(cards.find('script')).toHaveLength(0)
      expect(cards.first().text()).toContain("Garry's pond")
      expect(cards.eq(1).text()).toContain("Gary's pond <script>alert('hi')</script>")
      expect(cards.eq(1).text()).toContain("Garry's lake")
      expect(cards.eq(1).text()).toContain("It's deep")
      expect(cards.text()).not.toContain('&#39;')
    }
  })

  it('keeps user-typed backslashes before escaped characters on Check answers and print', () => {
    const journey = createSummary()
    journey.state.reservoirs[0].name = 'Tom\\&Jerry \\<b>pond'
    journey.state.reservoirs[0].notes = 'Fish \\& chips\\<i>'

    for (const $ of renderBoth(journey)) {
      const card = $('.govuk-summary-card').first()
      expect(card.find('b, i')).toHaveLength(0)
      expect(card.text()).toContain('Tom\\&Jerry \\<b>pond')
      expect(card.text()).toContain('Fish \\& chips\\<i>')
      expect(card.text()).not.toContain('&amp;')
      expect(card.text()).not.toContain('&lt;')
    }
  })

  it('preserves doubled backslashes, a literal URL and a line break on Check answers and print', () => {
    const journey = createSummary()
    const firstLine = String.raw`C:\\pond\\& chips https://example.com/a_b`
    journey.state.reservoirs[0].notes = `${firstLine}\nSecond line`

    for (const $ of renderBoth(journey)) {
      const notes = $('.govuk-summary-card')
        .first()
        .find('dt')
        .filter((_, label) => $(label).text().trim() === 'Notes (optional)')
        .next('dd')
      expect(notes.text()).toContain(firstLine)
      expect(notes.html()).toMatch(/<br>\s*Second line/)
      expect(notes.find('a')).toHaveLength(0)
    }
  })

  it('renders checkbox selections as bullets and uploaded files as download links', () => {
    const journey = createSummary()
    const fileId = randomUUID()
    journey.state.tanks[0].tankLinings = ['clay', 'synthetic']
    journey.state.tanks[0].tankEvidence = [
      {
        uploadId: randomUUID(),
        status: {
          uploadStatus: 'ready',
          metadata: { retrievalKey: 'test@example.com' },
          form: { file: { fileId, filename: 'Tank plan.pdf', contentLength: 123, fileStatus: 'complete' } },
          numberOfRejectedFiles: 0
        }
      }
    ]

    const $ = journey.view()
    const tank = $('.govuk-summary-card').last()
    const linings = tank
      .find('dt')
      .filter((_, label) => $(label).text().trim() === 'Tank linings')
      .next('dd')
      .find('ul li')
    expect(linings.map((_, item) => $(item).text().trim()).get()).toEqual(['Clay lining', 'Synthetic lining'])
    const download = tank.find('dd a')
    expect(download).toHaveLength(1)
    expect(download.text()).toBe('Tank plan.pdf')
    expect(download.attr('href')).toMatch(new RegExp(`/file-download/${fileId}$`))
  })

  it('shows each address part and coordinate on its own line, exactly as entered', () => {
    const journey = createSummary()
    Object.assign(journey.state.tanks[0], {
      tankAddress__addressLine1: String.raw`Tom\&Jerry's <b>Farm`,
      tankAddress__town: 'Penrith',
      tankAddress__postcode: 'CA10 1AA',
      tankLocation__easting: 351000,
      tankLocation__northing: 530000
    })

    const $ = journey.view()
    const answer = (label) =>
      $('.govuk-summary-card')
        .last()
        .find('dt')
        .filter((_, key) => $(key).text().trim() === label)
        .next('dd')
    expect(answer('Tank address (optional)').find('b')).toHaveLength(0)
    expect(answer('Tank address (optional)').html().trim().split('<br>').map(normalise)).toEqual([
      String.raw`Tom\&amp;Jerry's &lt;b&gt;Farm`,
      'Penrith',
      'CA10 1AA'
    ])
    expect(answer('Tank location (optional)').html().trim().split('<br>').map(normalise)).toEqual([
      'Easting: 351000',
      'Northing: 530000'
    ])
  })

  it('shows a blank single-line repeat answer as Not provided', () => {
    const journey = createSummary()
    journey.state.reservoirs[1].name = ''
    const $ = journey.view()
    const nameRow = $('.govuk-summary-card')
      .eq(1)
      .find('.govuk-summary-list__row')
      .filter((_, row) => $(row).find('dt').text().trim() === 'Reservoir name')
    expect(normalise(nameRow.find('dd').text())).toBe('Not provided')
  })

  it('shows single-line repeat answers verbatim without Markdown links or escapes', () => {
    const journey = createSummary()
    journey.state.reservoirs[0].name = 'See https://example.com/a_b (v1.2) *draft*'

    for (const $ of renderBoth(journey)) {
      const card = $('.govuk-summary-card').first()
      expect(card.find('dd a')).toHaveLength(0)
      expect(card.text()).toContain('See https://example.com/a_b (v1.2) *draft*')
    }
  })

  it('escapes injected markup in repeat answers on Check answers and print', () => {
    const journey = createSummary()
    journey.state.reservoirs[0].name = HTML_INJECTION
    journey.state.reservoirs[0].notes = `'><svg onload=alert(1)>`

    for (const $ of renderBoth(journey)) {
      const card = $('.govuk-summary-card').first()
      expect(card.find('script, svg, [onload]')).toHaveLength(0)
      const values = card
        .find('.govuk-summary-list__row')
        .filter((_, row) => /^(Reservoir name|Notes)/.test($(row).find('dt').text().trim()))
        .map((_, row) => $(row).find('dd').text().trim())
        .get()
      expect(values).toEqual([HTML_INJECTION, `'><svg onload=alert(1)>`])
    }
  })
})
