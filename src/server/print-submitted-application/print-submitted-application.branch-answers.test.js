import { randomUUID } from 'node:crypto'
import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import DeclarationPageController from '../declaration/declaration-page.controller.js'
import CheckResponsesPageController from '../check-responses/check-responses.controller.js'
import PrintSubmittedApplicationController from './print-submitted-application.controller.js'
import { createPageRenderer } from '../common/test-helpers/component-helpers.js'
import { ApplicationStatus } from '../common/constants/application-status.js'

vi.unmock('@defra/forms-model')
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () =>
  vi.importActual('@defra/forms-engine-plugin/engine/pageControllers/SummaryPageController.js')
)
vi.mock('@defra/forms-engine-plugin/controllers/StatusPageController.js', () =>
  vi.importActual('@defra/forms-engine-plugin/engine/pageControllers/StatusPageController.js')
)

const renderPrint = createPageRenderer(import.meta.url, 'print-submitted-application.html', {}, [
  'src/server/print-submitted-application/views'
])

function createJourney() {
  const model = new FormModel(
    {
      name: 'Water management',
      engine: 'V2',
      startPage: '/how-many-reservoirs',
      sections: [{ name: 'project', title: 'Your project details' }],
      lists: [],
      conditions: [false, true].map((multiple) => ({
        name: multiple ? 'multiple' : 'single',
        displayName: multiple ? 'Multiple reservoirs' : 'Single reservoir',
        value: {
          name: multiple ? 'multiple' : 'single',
          conditions: [
            {
              field: { name: 'moreThanOneReservoir', type: 'YesNoField', display: 'More than one reservoir?' },
              operator: 'is',
              value: { type: 'Value', value: String(multiple), display: multiple ? 'Yes' : 'No' }
            }
          ]
        }
      })),
      metadata: { version: '1.0.0' },
      pages: [
        {
          path: '/how-many-reservoirs',
          title: 'More than one reservoir?',
          section: 'project',
          components: [{ type: 'YesNoField', name: 'moreThanOneReservoir', title: 'More than one reservoir?' }]
        },
        {
          path: '/single-reservoir',
          title: 'Reservoir details',
          section: 'project',
          condition: 'single',
          components: [
            { type: 'TextField', name: 'whatTypeOfReservoir', title: 'What type of reservoir?' },
            { type: 'NumberField', name: 'howMuchWater', title: 'Reservoir storage capacity (m³)' }
          ]
        },
        {
          path: '/reservoir-items',
          title: 'Reservoir items',
          section: 'project',
          condition: 'multiple',
          controller: 'RepeatPageController',
          repeat: { options: { name: 'reservoirItems', title: 'Reservoir' }, schema: { min: 1, max: 5 } },
          components: [
            { type: 'TextField', name: 'reservoirItemName', title: 'Name of your reservoir' },
            { type: 'TextField', name: 'reservoirItemWhatTypeOfReservoir', title: 'What type of reservoir?' },
            { type: 'NumberField', name: 'reservoirItemHowMuchWater', title: 'Reservoir storage capacity (m³)' }
          ]
        },
        { path: '/summary', title: 'Check your answers', controller: 'CheckResponsesPageController', components: [] },
        { path: '/declaration', title: 'Declaration', controller: 'DeclarationPageController', components: [] },
        {
          path: '/print-submitted-application',
          title: 'Print application',
          controller: 'PrintSubmittedApplicationController',
          components: []
        }
      ]
    },
    { basePath: 'water-management' },
    { formsService: { getFormMetadata: async () => ({}) } },
    { CheckResponsesPageController, DeclarationPageController, PrintSubmittedApplicationController }
  )
  const state = {
    $$__referenceNumber: 'test-reference',
    applicationStatus: ApplicationStatus.SUBMITTED,
    submittedAt: '2026-11-11T14:00:00.000Z',
    moreThanOneReservoir: false,
    whatTypeOfReservoir: 'Obsolete single reservoir lining',
    howMuchWater: 11111,
    reservoirItems: [
      {
        itemId: randomUUID(),
        reservoirItemName: 'North reservoir',
        reservoirItemWhatTypeOfReservoir: 'Clay lined',
        reservoirItemHowMuchWater: 22222
      },
      {
        itemId: randomUUID(),
        reservoirItemName: 'South reservoir',
        reservoirItemWhatTypeOfReservoir: 'Synthetic lined',
        reservoirItemHowMuchWater: 33333
      }
    ]
  }
  const requestFor = (path) => ({
    method: 'get',
    path: `/water-management/${path}`,
    url: new URL(`http://localhost/water-management/${path}`),
    query: {},
    params: { slug: 'water-management', path },
    app: { model },
    auth: { credentials: { sbi: '123456789', crn: '1234567890' } },
    server: { plugins: { 'forms-engine-plugin': { cacheService: { getState: async () => state } } } }
  })
  return { model, state, requestFor }
}

describe('reservoir branch changes with the forms engine', () => {
  it('excludes obsolete single-reservoir answers from the GAS payload after changing to multiple reservoirs', () => {
    const { model, state, requestFor } = createJourney()
    const request = requestFor('declaration')
    expect(model.getFormContext(request, state).relevantState.howMuchWater).toBe(11111)

    state.moreThanOneReservoir = true
    const context = model.getFormContext(request, state)
    const payload = model.pageMap.get('/declaration').buildSubmissionData(request, context)

    expect(payload.answers).toEqual({
      referenceNumber: 'test-reference',
      moreThanOneReservoir: true,
      reservoirItems: state.reservoirItems
    })
    expect(state.howMuchWater).toBe(11111)
    expect(state.whatTypeOfReservoir).toBe('Obsolete single reservoir lining')
  })

  it('prints only relevant answers after switching between single and multiple reservoirs', async () => {
    const { model, state, requestFor } = createJourney()
    const request = requestFor('print-submitted-application')
    // Both branches remain saved when an applicant changes their earlier answer.
    expect(model.getFormContext(request, state).relevantState.howMuchWater).toBe(11111)
    state.moreThanOneReservoir = true
    const h = { view: (_name, viewModel) => renderPrint(viewModel) }
    const handler = model.pageMap.get('/print-submitted-application').makeGetRouteHandler()
    const $ = await handler(request, model.getFormContext(request, state), h)

    expect($('.govuk-summary-card')).toHaveLength(2)
    expect($('main').text()).toContain('North reservoir')
    expect($('main').text()).toContain('22222')
    expect($('main').text()).toContain('South reservoir')
    expect($('main').text()).toContain('33333')
    expect($('main').text()).not.toContain('11111')
    expect($('main').text()).not.toContain('Obsolete single reservoir lining')
    expect($('main').text()).toContain('test-reference')

    state.moreThanOneReservoir = false
    const single = await handler(request, model.getFormContext(request, state), h)
    expect(single('.govuk-summary-card')).toHaveLength(0)
    expect(single('main').text()).toContain('11111')
    expect(single('main').text()).not.toContain('North reservoir')
    expect(single('main').text()).not.toContain('South reservoir')
    expect(state.reservoirItems).toHaveLength(2)
  })
})
