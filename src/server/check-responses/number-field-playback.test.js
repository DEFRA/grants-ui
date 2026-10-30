// @vitest-environment node
import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import { redirectOrMakeHandler } from '@defra/forms-engine-plugin/engine/routes/index.js'
import CheckResponsesPageController from './check-responses.controller.js'
import { GrantsSummaryPageController } from '../common/controllers/summary-page.controller.js'
import { preserveNumberFieldInputs } from '../common/helpers/state/preserve-number-field-inputs.js'
import { buildPrintViewModel } from '../common/helpers/print-application-service/print-application-service.js'
import { configureFormDefinition } from '../common/forms/services/form.js'
import MapSubmissionPageController from '../common/map/map-submission-page.controller.js'

vi.unmock('@defra/forms-model')
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () =>
  vi.importActual('@defra/forms-engine-plugin/engine/pageControllers/SummaryPageController.js')
)

function createJourney(format, controller = 'CheckResponsesPageController') {
  const model = new FormModel(
    configureFormDefinition({
      name: 'Number playback',
      engine: 'V2',
      startPage: '/amount',
      sections: [],
      lists: [],
      metadata: { tasklist: {} },
      conditions: [],
      pages: [
        {
          path: '/amount',
          title: 'Water storage capacity',
          components: [
            {
              type: 'NumberField',
              name: 'capacity',
              title: 'Capacity',
              ...(format && { format }),
              schema: { precision: 4 }
            },
            { type: 'NumberField', name: 'sbi', title: 'SBI' }
          ]
        },
        { path: '/summary', title: 'Check answers', controller, components: [] },
        { path: '/declaration', title: 'Declaration', components: [] }
      ]
    }),
    { basePath: 'grant' },
    { formsService: { getFormMetadata: async () => ({}) } },
    { CheckResponsesPageController, GrantsSummaryPageController, MapSubmissionPageController }
  )
  let savedState = { $$__referenceNumber: 'test-reference' }
  const cacheService = {
    getState: async () => structuredClone(savedState),
    setState: async (_request, state) => {
      savedState = structuredClone(state)
      return state
    },
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
    view: (name, viewModel) => ({ name, viewModel })
  }
  return {
    model,
    state: () => savedState,
    async dispatch(path, payload) {
      const request = {
        method: payload ? 'post' : 'get',
        payload,
        query: {},
        params: { slug: 'grant', path },
        path: `/grant/${path}`,
        app: { model },
        yar: { flash: () => [] },
        server: { plugins: { 'forms-engine-plugin': { cacheService } } }
      }
      return redirectOrMakeHandler(
        request,
        h,
        (req, toolkit, context) => {
          preserveNumberFieldInputs(req, context)
          return toolkit.continue
        },
        (page, context) => {
          const handler = payload ? page.makePostRouteHandler() : page.makeGetRouteHandler()
          return handler(request, context, h)
        }
      )
    },
    print() {
      return buildPrintViewModel({
        definition: model.def,
        answers: savedState,
        submittedAt: '2026-10-30T12:00:00.000Z',
        slug: 'grant',
        sessionData: {},
        form: { name: 'Number playback' }
      })
    }
  }
}

describe.each(['CheckResponsesPageController', 'SummaryPageController', 'MapSubmissionPageController'])(
  'number playback using %s',
  (Controller) => {
    it.each([
      ['125000.50', '125,000.50'],
      ['125000.5', '125,000.5'],
      ['125000', '125,000'],
      ['0.00', '0.00'],
      ['-12500.50', '-12,500.50']
    ])('preserves entered precision for %s on Check answers and print', async (input, expected) => {
      const journey = createJourney('thousands', Controller)
      await journey.dispatch('amount', { action: 'validate', capacity: input, sbi: '125000' })
      expect(journey.state()).toMatchObject({
        capacity: Number(input),
        sbi: 125000,
        $$__numberFieldInputs: { capacity: input }
      })
      const summary = await journey.dispatch('summary')
      expect(summary.viewModel.checkAnswers[0].summaryList.rows.map((row) => row.value.text ?? row.value.html)).toEqual(
        [expected, '125000']
      )
      expect(summary.viewModel.context.relevantState).toEqual({ capacity: Number(input), sbi: 125000 })
      expect(journey.print().sections[0].questions.map((question) => question.answer)).toEqual([expected, '125000'])
      const inputPage = await journey.dispatch('amount')
      expect(inputPage.viewModel.components[0].model.value).toBe(input)
    })

    it('leaves unconfigured fields and their saved state unchanged', async () => {
      const journey = createJourney(undefined, Controller)
      await journey.dispatch('amount', { action: 'validate', capacity: '125000', sbi: '125000' })
      const summary = await journey.dispatch('summary')
      expect(summary.viewModel.checkAnswers[0].summaryList.rows[0].value.html).toBe('125000')
      expect(journey.print().sections[0].questions[0].answer).toBe('125000')
      expect(journey.state()).not.toHaveProperty('$$__numberFieldInputs')
    })

    it('replaces retained precision when an answer is edited and does not save invalid input', async () => {
      const journey = createJourney('thousands', Controller)
      await journey.dispatch('amount', { action: 'validate', capacity: '125000.50', sbi: '125000' })
      await journey.dispatch('amount', { action: 'validate', capacity: '125000.5', sbi: '125000' })
      const invalid = await journey.dispatch('amount', { action: 'validate', capacity: 'invalid', sbi: '125000' })
      expect(invalid.viewModel.errors[0].name).toBe('capacity')
      expect(journey.state().$$__numberFieldInputs).toEqual({ capacity: '125000.5' })
      const summary = await journey.dispatch('summary')
      expect(summary.viewModel.checkAnswers[0].summaryList.rows[0].value.text).toBe('125,000.5')
    })
  }
)
