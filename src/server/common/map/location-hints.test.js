import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import { redirectOrMakeHandler } from '@defra/forms-engine-plugin/engine/routes/index.js'
import { ControllerType } from '@defra/forms-model'
import { captureLocationHints, renderLocationHints } from './location-hints.js'
import { formsRequestPipeline } from '../request-pipeline/forms-request-pipeline.js'
import { createPageRenderer } from '../test-helpers/component-helpers.js'
import CheckResponsesPageController from '../../check-responses/check-responses.controller.js'
import DeclarationPageController from '../../declaration/declaration-page.controller.js'
import { MAP_LOCATION_HINT_PREFIX } from '../../../shared/map-location-hints.js'
import { buildPrintViewModel } from '../helpers/print-application-service/print-application-service.js'

vi.unmock('@defra/forms-model')
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () =>
  vi.importActual('@defra/forms-engine-plugin/engine/pageControllers/SummaryPageController.js')
)
vi.mock('../request-pipeline/redirects/application-deleted-redirect.js', () => ({
  applicationDeletedRedirect: vi.fn((_request, h) => h.continue)
}))
vi.mock('../request-pipeline/redirects/application-window-closed-redirect.js', () => ({
  resolveApplicationWindowClosedPath: vi.fn(() => null)
}))
vi.mock('../request-pipeline/redirects/forms-status-redirect.js', () => ({
  formsStatusRedirect: vi.fn((_request, h) => h.continue)
}))
vi.mock('../request-pipeline/permissions/enforce-page-permission.js', () => ({
  enforcePagePermission: vi.fn((_request, h) => h.continue)
}))

const TEXT = 'Approximate location: NE38, Washington, England, UK'
const ANSWER = { location__easting: '432100', location__northing: '556200' }
const metadata = (text = TEXT, answer = ANSWER) => JSON.stringify({ text, answer })
const payload = (hint = metadata(), answer = ANSWER) => ({
  action: 'validate',
  ...answer,
  [`${MAP_LOCATION_HINT_PREFIX}location`]: hint
})
const renderStandard = createPageRenderer(import.meta.url, 'summary.html')
const renderCustom = createPageRenderer(import.meta.url, 'check-responses-page.html', {}, [
  'src/server/check-responses/views'
])
const renderPrint = createPageRenderer(import.meta.url, 'print-submitted-application.html', {}, [
  'src/server/print-submitted-application/views'
])

/** Use the installed engine's validation, answer selection, page handlers and normal save path. */
function journey({ components, summaryController = ControllerType.Summary } = {}) {
  const model = new FormModel(
    {
      name: 'Map hint test',
      engine: 'V2',
      startPage: '/location',
      sections: [],
      lists: [],
      conditions: [],
      metadata: { version: '1.0.0' },
      pages: [
        {
          path: '/location',
          title: 'Project location',
          components: components ?? [
            {
              name: 'location',
              type: 'EastingNorthingField',
              title: 'Project location',
              options: { showApproximateLocation: true }
            }
          ]
        },
        { path: '/summary', title: 'Check your answers', controller: summaryController, components: [] },
        { path: '/declaration', title: 'Declaration', components: [] }
      ]
    },
    { basePath: 'test-grant' },
    { formsService: { getFormMetadata: async () => ({}) } },
    { CheckResponsesPageController }
  )
  let saved = { $$__referenceNumber: 'TEST-REFERENCE', unrelatedUiState: 'keep' }
  let lastContext
  let lastRequest
  const cacheService = {
    getState: async () => structuredClone(saved),
    setState: vi.fn(async (_request, state) => {
      saved = structuredClone(state)
      return state
    }),
    getFlash: () => undefined
  }
  const h = {
    continue: Symbol('continue'),
    redirect: (location) => ({
      location,
      code() {
        return this
      }
    }),
    view: (template, context) => ({ variety: 'view', source: { template, context } })
  }
  return {
    model,
    cacheService,
    state: () => saved,
    context: () => lastContext,
    request: () => lastRequest,
    async dispatch(path, { method = 'get', payload: formPayload } = {}) {
      const url = new URL(`/test-grant${path}`, 'http://localhost')
      const request = {
        method,
        payload: structuredClone(formPayload),
        query: Object.fromEntries(url.searchParams),
        params: { slug: 'test-grant', path: url.pathname.replace('/test-grant/', '') },
        path: url.pathname,
        url,
        app: { model },
        route: { realm: { plugin: '@defra/forms-engine-plugin' } },
        auth: { credentials: { sbi: 'test-business', crn: 'test-customer' } },
        yar: { flash: () => [] },
        server: { plugins: { 'forms-engine-plugin': { cacheService } } }
      }
      captureLocationHints(request, h)
      const result = await redirectOrMakeHandler(request, h, formsRequestPipeline, async (page, context) => {
        lastContext = context
        lastRequest = request
        return method === 'post'
          ? page.makePostRouteHandler()(request, context, h)
          : page.makeGetRouteHandler()(request, context, h)
      })
      request.response = result
      renderLocationHints(request, h)
      return result
    }
  }
}

describe('shared saved map hints', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  test.each([ControllerType.Summary, 'CheckResponsesPageController'])(
    'persists the hint on a normal map page POST and renders it on %s without a lookup',
    async (summaryController) => {
      const form = journey({ summaryController })
      const submitted = await form.dispatch('/location', { method: 'post', payload: payload() })
      expect(submitted.location).toBe('/test-grant/summary')
      expect(form.state()).toMatchObject({
        location__easting: 432100,
        location__northing: 556200,
        unrelatedUiState: 'keep',
        mapLocationHints: { location: { text: TEXT, answer: '[432100,556200]' } }
      })
      const saved = structuredClone(form.state())
      const result = await form.dispatch('/summary')
      const render = summaryController === ControllerType.Summary ? renderStandard : renderCustom
      const $ = render(result.source.context)
      const row = $('.govuk-summary-list__value').first()
      expect(row.text()).toContain('Easting: 432100')
      expect(row.text()).toContain('Northing: 556200')
      expect(row.text()).toContain(TEXT)
      expect(row.find('strong, b')).toHaveLength(0)
      expect(form.state()).toEqual(saved)
      expect(form.cacheService.setState).toHaveBeenCalledTimes(1)
      expect(result.source.context.details[0].items[0].value).not.toContain(TEXT)
      expect(fetch).not.toHaveBeenCalled()
    }
  )

  test('excludes persisted hints from the real GAS application payload while retaining map coordinates', async () => {
    const form = journey()
    await form.dispatch('/location', { method: 'post', payload: payload() })
    await form.dispatch('/summary')
    const controller = new DeclarationPageController(form.model, { path: '/declaration', title: 'Declaration' })
    const submission = controller.buildApplicationData(form.request(), {
      ...form.context(),
      payload: { declaration: true }
    })
    expect(form.state().mapLocationHints.location.text).toBe(TEXT)
    expect(submission.answers).toEqual({
      referenceNumber: 'TEST-REFERENCE',
      location__easting: 432100,
      location__northing: 556200,
      declaration: true
    })
    expect(JSON.stringify(submission)).not.toContain(TEXT)
    expect(JSON.stringify(submission)).not.toContain('mapLocationHint')
  })

  test('shows the saved full hint alongside coordinates in the view/print application page without a lookup', async () => {
    const form = journey()
    await form.dispatch('/location', { method: 'post', payload: payload() })
    const answers = structuredClone({ ...form.state(), applicationStatus: 'SUBMITTED' })
    const original = structuredClone(answers)
    const viewModel = buildPrintViewModel({
      definition: form.model.def,
      answers,
      form: { name: 'Test grant' },
      slug: 'test-grant',
      referenceNumber: answers.$$__referenceNumber,
      submittedAt: '2026-09-07T10:30:00.000Z',
      sessionData: {}
    })
    const $ = renderPrint(viewModel)
    const row = $('.app-submitted-answers .govuk-summary-list__value').first()
    expect(row.text()).toContain('432100, 556200')
    expect(row.find('p').text()).toBe(TEXT)
    expect(row.find('strong, b')).toHaveLength(0)
    expect($('.app-submitted-answers a')).toHaveLength(0)
    expect($('#print-button')).toHaveLength(1)
    expect(answers).toEqual(original)
    expect(fetch).not.toHaveBeenCalled()
  })

  test.each([
    '',
    '{bad json',
    'null',
    JSON.stringify({ text: 'x'.repeat(1001), answer: ANSWER }),
    metadata(TEXT, { ...ANSWER, location__easting: '432101' })
  ])('discards missing, malformed, oversized or stale metadata without failing the answer POST (%s)', async (hint) => {
    const form = journey()
    await form.dispatch('/location', { method: 'post', payload: payload() })
    const result = await form.dispatch('/location', { method: 'post', payload: payload(hint) })
    expect(result.location).toBe('/test-grant/summary')
    expect(form.state().mapLocationHints).toEqual({})
    expect(form.state()).toMatchObject({ location__easting: 432100, location__northing: 556200 })
  })

  test('clears an old hint when coordinates change and no replacement is ready', async () => {
    const form = journey()
    await form.dispatch('/location', { method: 'post', payload: payload() })
    await form.dispatch('/location', {
      method: 'post',
      payload: payload('', { ...ANSWER, location__easting: '432101' })
    })
    const result = await form.dispatch('/summary')
    expect(form.state().mapLocationHints).toEqual({})
    expect(renderStandard(result.source.context)('.govuk-summary-list__value').text()).not.toContain(TEXT)
  })

  test('does not save metadata or answers on a validation error', async () => {
    const form = journey()
    const result = await form.dispatch('/location', {
      method: 'post',
      payload: payload(metadata(), { ...ANSWER, location__easting: 'invalid' })
    })
    expect(result.variety).toBe('view')
    expect(form.context().errors.length).toBeGreaterThan(0)
    expect(form.state().mapLocationHints).toBeUndefined()
    expect(form.cacheService.setState).not.toHaveBeenCalled()
  })

  test('ignores hints for unconfigured, disabled and unrelated fields on the same generic route', async () => {
    const form = journey({ components: [{ name: 'location', type: 'EastingNorthingField', title: 'Location' }] })
    const posted = { ...payload(), [`${MAP_LOCATION_HINT_PREFIX}unknown`]: metadata() }
    await form.dispatch('/location', { method: 'post', payload: posted })
    expect(form.state().mapLocationHints).toEqual({})
    expect(Object.keys(form.context().payload).some((key) => key.startsWith(MAP_LOCATION_HINT_PREFIX))).toBe(false)
  })

  test('escapes both the saved prefix and provider text when rendering CYA', async () => {
    const form = journey({
      components: [
        {
          name: 'location',
          type: 'EastingNorthingField',
          title: 'Location',
          options: { showApproximateLocation: true, approximateLocationPrefix: '<em>Nearby:</em>' }
        }
      ]
    })
    const text = '<em>Nearby:</em> <img src=x onerror=alert(1)>'
    await form.dispatch('/location', { method: 'post', payload: payload(metadata(text)) })
    const result = await form.dispatch('/summary')
    const row = renderStandard(result.source.context)('.govuk-summary-list__value').first()
    expect(row.text()).toContain(text)
    expect(row.find('em, img')).toHaveLength(0)
    expect(row.find('strong, b')).toHaveLength(0)
  })

  test('does not display saved metadata against a different answer', async () => {
    const form = journey()
    await form.dispatch('/location', { method: 'post', payload: payload() })
    form.state().location__easting = 432101
    const result = await form.dispatch('/summary')
    expect(renderStandard(result.source.context)('.govuk-summary-list__value').text()).not.toContain(TEXT)
  })

  test('keeps hints independent for all three point types and preserves other pages’ hints', async () => {
    const components = [
      {
        name: 'location',
        type: 'EastingNorthingField',
        title: 'Grid coordinates',
        options: { showApproximateLocation: true }
      },
      {
        name: 'latLong',
        type: 'LatLongField',
        title: 'Latitude and longitude',
        options: { showApproximateLocation: true, approximateLocationPrefix: 'Nearby:' }
      },
      { name: 'gridRef', type: 'OsGridRefField', title: 'Grid reference', options: { showApproximateLocation: true } }
    ]
    const form = journey({ components })
    const posted = {
      ...payload(),
      latLong__latitude: '51.5000000',
      latLong__longitude: '0.0000000',
      gridRef: 'tq 30000 80000',
      [`${MAP_LOCATION_HINT_PREFIX}latLong`]: metadata('Nearby: London, UK', {
        latLong__latitude: '51.5',
        latLong__longitude: '0'
      }),
      [`${MAP_LOCATION_HINT_PREFIX}gridRef`]: metadata('Approximate location: Westminster, UK', {
        gridRef: 'TQ3000080000'
      })
    }
    form.state().mapLocationHints = { otherPage: { text: 'Keep another location', answer: 'other' } }
    await form.dispatch('/location', { method: 'post', payload: posted })
    const result = await form.dispatch('/summary')
    const rows = renderStandard(result.source.context)('.govuk-summary-list__value')
    expect(rows.eq(0).text()).toContain(TEXT)
    expect(rows.eq(1).text()).toContain('Nearby: London, UK')
    expect(rows.eq(2).text()).toContain('Approximate location: Westminster, UK')
    expect(form.state().mapLocationHints.otherPage.text).toBe('Keep another location')
  })

  test('clears the hint when an optional location answer is removed', async () => {
    const form = journey({
      components: [
        {
          name: 'location',
          type: 'EastingNorthingField',
          title: 'Location',
          options: { showApproximateLocation: true, required: false }
        }
      ]
    })
    await form.dispatch('/location', { method: 'post', payload: payload() })
    await form.dispatch('/location', {
      method: 'post',
      payload: payload('', { location__easting: '', location__northing: '' })
    })
    const result = await form.dispatch('/summary')
    expect(form.state().mapLocationHints).toEqual({})
    expect(renderStandard(result.source.context)('.govuk-summary-list__value').text()).not.toContain(TEXT)
  })

  test('leaves non-engine routes and GET requests untouched', () => {
    const h = { continue: Symbol('continue') }
    for (const request of [
      { method: 'post', route: { realm: { plugin: 'other' } }, payload: payload() },
      { method: 'get', route: { realm: { plugin: '@defra/forms-engine-plugin' } }, payload: payload() }
    ]) {
      const before = structuredClone(request)
      expect(captureLocationHints(request, h)).toBe(h.continue)
      expect(renderLocationHints(request, h)).toBe(h.continue)
      expect(request).toEqual(before)
    }
  })
})
