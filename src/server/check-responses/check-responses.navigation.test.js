// @vitest-environment node
import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import { redirectOrMakeHandler } from '@defra/forms-engine-plugin/engine/routes/index.js'
import CheckResponsesPageController from './check-responses.controller.js'
import TotalEstimatedCostTaskPageController from '../non-land-grants/water-management/controllers/total-estimated-cost-task-page.controller.js'
import TaskPageController from '../task-list/task-page.controller.js'
import TaskListPageController from '../task-list/task-list-page.controller.js'
import { QuestionPageController } from '@defra/forms-engine-plugin/controllers/QuestionPageController.js'
import { withDerivedState } from '../common/helpers/state/with-derived-state.js'
import { getCompletionStats } from '../task-list/task-list.helper.js'

// Exercise the installed engine's context, validation and redirects rather than
// the controller substitutes used by the default unit-test setup.
vi.unmock('@defra/forms-model')
vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () =>
  vi.importActual('@defra/forms-engine-plugin/engine/pageControllers/QuestionPageController.js')
)
vi.mock('@defra/forms-engine-plugin/controllers/SummaryPageController.js', () =>
  vi.importActual('@defra/forms-engine-plugin/engine/pageControllers/SummaryPageController.js')
)

class AutomaticResultController extends withDerivedState(QuestionPageController, {
  stateKeys: ['totalEstimatedCost'],
  requiresAcknowledgement: false
}) {
  async getCalculatedAnswers(_request, state) {
    return { totalEstimatedCost: state.howMuchWater * 2.5 }
  }
}

function createJourney(ResultController = TotalEstimatedCostTaskPageController) {
  const model = new FormModel(
    {
      name: 'Calculated answers test',
      engine: 'V2',
      startPage: '/task-list',
      sections: [
        { name: 'costs', title: 'Estimated costs' },
        { name: 'other', title: 'Other details' }
      ],
      lists: [],
      conditions: [
        {
          name: 'includeCosts',
          displayName: 'Include costs',
          value: {
            name: 'includeCosts',
            conditions: [
              {
                field: { name: 'howMuchWater', type: 'NumberField', display: 'Water capacity' },
                operator: 'is more than',
                value: { type: 'Value', value: '0', display: '0' }
              }
            ]
          }
        }
      ],
      metadata: {
        tasklist: { returnAfterSection: true },
        pageConfig: {
          '/total-estimated-cost': {
            excludeFromTaskCompletion: true,
            derivedState: {
              stateKeys: [
                'reservoirCostPerUnit',
                'distNetworkCostPerUnit',
                'tanksCostPerUnit',
                'reservoirCost',
                'waterDistributionNetworkCost',
                'waterTanksCost',
                'totalEstimatedCost',
                'estimatedMaxGrant'
              ],
              requiresAcknowledgement: true
            },
            costs: { reservoirCostPerUnit: 2.5, distNetworkCostPerUnit: 5, tanksCostPerUnit: 1.5, grantMaxRate: 0.4 }
          },
          '/summary': {
            derivedStatePages: ['/total-estimated-cost'],
            additionalSections: [
              {
                page: '/total-estimated-cost',
                items: [{ title: 'Total estimated cost', stateValue: 'additionalAnswers.totalEstimatedCost' }]
              }
            ]
          }
        }
      },
      pages: [
        { path: '/task-list', title: 'Tasks', controller: 'TaskListPageController', components: [] },
        {
          path: '/amount',
          title: 'Water capacity',
          section: 'costs',
          controller: 'TaskPageController',
          components: [{ type: 'NumberField', name: 'howMuchWater', title: 'Water capacity' }]
        },
        {
          path: '/total-estimated-cost',
          title: 'Total estimated cost',
          section: 'costs',
          condition: 'includeCosts',
          controller: 'ConfiguredResultController',
          components: []
        },
        {
          path: '/other-details',
          title: 'Other details',
          section: 'other',
          controller: 'TaskPageController',
          components: [{ type: 'TextField', name: 'otherAnswer', title: 'Other answer' }]
        },
        { path: '/summary', title: 'Check answers', controller: 'CheckResponsesPageController', components: [] },
        { path: '/declaration', title: 'Declaration', components: [] }
      ]
    },
    { basePath: 'grant' },
    { formsService: { getFormMetadata: async () => ({}) } },
    {
      CheckResponsesPageController,
      ConfiguredResultController: ResultController,
      TaskPageController,
      TaskListPageController
    }
  )

  const costPage = model.pageMap.get('/total-estimated-cost')
  let state = {
    $$__referenceNumber: 'test-reference',
    itemsPlanningToInstall: ['RESERVOIR'],
    howMuchWater: 100,
    otherAnswer: 'Provided'
  }
  const initialCostPage = new TotalEstimatedCostTaskPageController(model, costPage.pageDef)
  state.additionalAnswers = initialCostPage.getCalculatedAnswers({ app: { model } }, state)
  const cacheService = {
    getState: async () => structuredClone(state),
    setState: async (_request, updated) => {
      state = structuredClone(updated)
      return updated
    },
    getFlash: () => undefined
  }

  const response = (values) => ({
    statusCode: 200,
    ...values,
    code(statusCode) {
      this.statusCode = statusCode
      return this
    }
  })
  const h = {
    redirect: (location) => response({ location }),
    view: (viewName, viewModel) => response({ viewName, viewModel })
  }

  return {
    model,
    costPage,
    state: () => state,
    async dispatch(path, { method = 'get', payload } = {}) {
      const url = new URL(path, 'http://localhost')
      const request = {
        method,
        payload,
        url,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        params: { slug: 'grant', path: url.pathname.replace('/grant/', '') },
        app: { model },
        yar: { flash: () => [] },
        server: { plugins: { 'forms-engine-plugin': { cacheService } } }
      }
      return redirectOrMakeHandler(request, h, undefined, (page, context) => {
        const handler = method === 'get' ? page.makeGetRouteHandler() : page.makePostRouteHandler()
        return handler(request, context, h)
      })
    }
  }
}

describe('Check answers derived-state navigation with the forms engine', () => {
  it('returns from an edited answer through recalculation to Check answers across a task boundary', async () => {
    const journey = createJourney()
    const edit = await journey.dispatch('/grant/amount?returnUrl=%2Fgrant%2Fsummary', {
      method: 'post',
      payload: { action: 'validate', howMuchWater: '200' }
    })
    expect(edit.location).toBe('/grant/summary')
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(250)
    expect(getCompletionStats({ page: { def: journey.model.def } }, journey.model, journey.state())).toEqual({
      completed: 2,
      total: 2,
      isComplete: true
    })

    const detour = await journey.dispatch(edit.location)
    expect(detour.statusCode).toBe(302)
    expect(detour.location).toBe('/grant/total-estimated-cost?returnUrl=%2Fgrant%2Fsummary')

    const calculated = await journey.dispatch(detour.location)
    expect(calculated.statusCode).toBe(200)
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(500)

    const continued = await journey.dispatch(detour.location, { method: 'post', payload: { action: 'continue' } })
    expect(continued.statusCode).toBe(303)
    expect(continued.location).toBe('/grant/summary')

    const summary = await journey.dispatch(continued.location)
    expect(summary.viewName).toBe('check-responses-page')
    expect(summary.viewModel.checkAnswers[0].summaryList.rows).toContainEqual({
      key: { text: 'Total estimated cost' },
      value: { text: 500 }
    })
  })

  it('returns to the recalculated total after removing an item from the selected installations', async () => {
    const journey = createJourney()
    journey.state().itemsPlanningToInstall = ['RESERVOIR', 'WATER_DISTRIBUTION_NETWORK']
    journey.state().waterDistributionLength = 50
    journey.state().additionalAnswers = new TotalEstimatedCostTaskPageController(
      journey.model,
      journey.costPage.pageDef
    ).getCalculatedAnswers({ app: { model: journey.model } }, journey.state())

    const edit = await journey.dispatch('/grant/amount?returnUrl=%2Fgrant%2Fsummary', {
      method: 'post',
      payload: { action: 'validate', howMuchWater: '100' }
    })
    // Simulate returning to the checkbox page from Check answers and removing
    // one selection: the summary must require the user to review the new total.
    journey.state().itemsPlanningToInstall = ['RESERVOIR']

    const detour = await journey.dispatch(edit.location)
    expect(detour.statusCode).toBe(302)
    expect(detour.location).toBe('/grant/total-estimated-cost?returnUrl=%2Fgrant%2Fsummary')

    await journey.dispatch(detour.location)
    expect(journey.state().additionalAnswers).toMatchObject({
      reservoirCost: 250,
      waterDistributionNetworkCost: 0,
      totalEstimatedCost: 250
    })
  })

  it('redirects a direct Check answers POST to recalculate before proceeding', async () => {
    const journey = createJourney()
    journey.state().howMuchWater = 200

    const result = await journey.dispatch('/grant/summary', { method: 'post', payload: { action: 'continue' } })

    expect(result.statusCode).toBe(303)
    expect(result.location).toBe('/grant/total-estimated-cost?returnUrl=%2Fgrant%2Fsummary')
  })

  it('keeps incomplete questions ahead of recalculation', async () => {
    const journey = createJourney()
    journey.state().howMuchWater = 200
    delete journey.state().otherAnswer

    const result = await journey.dispatch('/grant/summary')

    expect(result.location).toBe('/grant/other-details')
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(250)
  })

  it('omits both the detour and saved calculated rows when their page becomes inapplicable', async () => {
    const journey = createJourney()
    const edit = await journey.dispatch('/grant/amount?returnUrl=%2Fgrant%2Fsummary', {
      method: 'post',
      payload: { action: 'validate', howMuchWater: '0' }
    })

    const summary = await journey.dispatch(edit.location)

    expect(summary.viewName).toBe('check-responses-page')
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(250)
    expect(summary.viewModel.checkAnswers.flatMap((section) => section.summaryList.rows)).not.toContainEqual(
      expect.objectContaining({ key: { text: 'Total estimated cost' } })
    )
  })

  it('refreshes a calculated result without a page visit and checks it again on GET and POST', async () => {
    const journey = createJourney(AutomaticResultController)
    const persist = vi.spyOn(journey.costPage, 'setState')
    journey.state().howMuchWater = 200

    const summary = await journey.dispatch('/grant/summary')

    expect(summary.viewName).toBe('check-responses-page')
    expect(summary.viewModel.checkAnswers[0].summaryList.rows).toContainEqual({
      key: { text: 'Total estimated cost' },
      value: { text: 500 }
    })
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(500)
    expect(persist).toHaveBeenCalledTimes(1)

    const revisited = await journey.dispatch('/grant/summary')
    expect(revisited.viewName).toBe('check-responses-page')
    expect(persist).toHaveBeenCalledTimes(1)

    journey.state().howMuchWater = 300
    const submitted = await journey.dispatch('/grant/summary', { method: 'post', payload: { action: 'continue' } })
    expect(submitted.location).toBe('/grant/declaration')
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(750)
    expect(persist).toHaveBeenCalledTimes(2)
  })
})
