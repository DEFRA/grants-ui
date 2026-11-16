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
import { RepeatPageController } from '@defra/forms-engine-plugin/controllers/RepeatPageController.js'
import { enableRepeatTaskContext } from '../task-list/repeat-task-context.js'
import { randomUUID } from 'node:crypto'

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

function createJourney(ResultController = TotalEstimatedCostTaskPageController, { withRepeater = false } = {}) {
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
      conditions: withRepeater
        ? []
        : [
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
                'reservoirs',
                'reservoirCost',
                'distNetworkCostPerUnit',
                'tanksCostPerUnit',
                'waterDistributionNetworkCost',
                'waterTanksCost',
                'totalEstimatedCost',
                'estimatedMaxGrantBeforeReduction',
                'estimatedMaxGrant',
                'minGrantReached',
                'maxGrantReached'
              ],
              requiresAcknowledgement: true
            },
            costs: {
              reservoirClayHighCostPerUnit: 2.5,
              reservoirClayLowCostPerUnit: 2.0,
              reservoirSyntheticHighCostPerUnit: 3.5,
              reservoirSyntheticLowCostPerUnit: 3.0,
              distNetworkCostPerUnit: 5,
              tanksCostPerUnit: 1.5,
              grantMaxRate: 0.4
            }
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
        ...(withRepeater
          ? [
              {
                path: '/reservoir-items',
                title: 'Reservoir items',
                section: 'costs',
                controller: 'RepeatPageController',
                repeat: { options: { name: 'reservoirItems', title: 'Reservoir' }, schema: { min: 1, max: 5 } },
                components: [
                  { type: 'TextField', name: 'reservoirItemName', title: 'Name of your reservoir' },
                  { type: 'TextField', name: 'reservoirItemWhatTypeOfReservoir', title: 'Reservoir type' },
                  { type: 'NumberField', name: 'reservoirItemHowMuchWater', title: 'Reservoir storage capacity' }
                ]
              }
            ]
          : [
              {
                path: '/amount',
                title: 'Water capacity',
                section: 'costs',
                controller: 'TaskPageController',
                components: [{ type: 'NumberField', name: 'howMuchWater', title: 'Water capacity' }]
              }
            ]),
        {
          path: '/total-estimated-cost',
          title: 'Total estimated cost',
          section: 'costs',
          condition: withRepeater ? undefined : 'includeCosts',
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
    howMuchWater: 100000,
    otherAnswer: 'Provided'
  }
  if (withRepeater) {
    state.moreThanOneReservoir = true
    state.reservoirItems = [
      {
        itemId: randomUUID(),
        reservoirItemName: 'North reservoir',
        reservoirItemWhatTypeOfReservoir: 'clay',
        reservoirItemHowMuchWater: 100000
      },
      {
        itemId: randomUUID(),
        reservoirItemName: 'South reservoir',
        reservoirItemWhatTypeOfReservoir: 'synthetic',
        reservoirItemHowMuchWater: 200000
      }
    ]
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
    continue: Symbol('continue'),
    redirect: (location) => response({ location }),
    view: (viewName, viewModel) => response({ viewName, viewModel })
  }

  return {
    model,
    costPage,
    state: () => state,
    async dispatch(path, { method = 'get', payload } = {}) {
      const url = new URL(path, 'http://localhost')
      const [pagePath, itemId] = url.pathname.replace('/grant/', '').split('/')
      const request = {
        method,
        payload,
        url,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        params: { slug: 'grant', path: pagePath, itemId: itemId === 'summary' ? undefined : itemId },
        app: { model },
        yar: { flash: () => [] },
        server: { plugins: { 'forms-engine-plugin': { cacheService } } }
      }
      const onRequest = () => {
        enableRepeatTaskContext(request)
        return h.continue
      }
      return redirectOrMakeHandler(request, h, onRequest, (page, context) => {
        const isRepeat = page instanceof RepeatPageController
        let factory = method === 'get' ? 'makeGetRouteHandler' : 'makePostRouteHandler'
        if (isRepeat && request.path.endsWith('/summary')) {
          factory = method === 'get' ? 'makeGetListSummaryRouteHandler' : 'makePostListSummaryRouteHandler'
        } else if (isRepeat && request.path.endsWith('/confirm-delete')) {
          factory = method === 'get' ? 'makeGetItemDeleteRouteHandler' : 'makePostItemDeleteRouteHandler'
        }
        const handler = page[factory]()
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
      payload: { action: 'validate', howMuchWater: '200000' }
    })
    expect(edit.location).toBe('/grant/summary')
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(205000)
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
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(405000)

    const continued = await journey.dispatch(detour.location, { method: 'post', payload: { action: 'continue' } })
    expect(continued.statusCode).toBe(303)
    expect(continued.location).toBe('/grant/summary')

    const summary = await journey.dispatch(continued.location)
    expect(summary.viewName).toBe('check-responses-page')
    expect(summary.viewModel.checkAnswers[0].summaryList.rows).toContainEqual({
      key: { text: 'Total estimated cost' },
      value: { text: 405000 }
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
      payload: { action: 'validate', howMuchWater: '100000' }
    })
    // Simulate returning to the checkbox page from Check answers and removing
    // one selection: the summary must require the user to review the new total.
    journey.state().itemsPlanningToInstall = ['RESERVOIR']

    const detour = await journey.dispatch(edit.location)
    expect(detour.statusCode).toBe(302)
    expect(detour.location).toBe('/grant/total-estimated-cost?returnUrl=%2Fgrant%2Fsummary')

    await journey.dispatch(detour.location)
    expect(journey.state().additionalAnswers).toMatchObject({
      reservoirCost: 205000,
      waterDistributionNetworkCost: 0,
      totalEstimatedCost: 205000
    })
  })

  it('redirects a direct Check answers POST to recalculate before proceeding', async () => {
    const journey = createJourney()
    journey.state().howMuchWater = 200000

    const result = await journey.dispatch('/grant/summary', { method: 'post', payload: { action: 'continue' } })

    expect(result.statusCode).toBe(303)
    expect(result.location).toBe('/grant/total-estimated-cost?returnUrl=%2Fgrant%2Fsummary')
  })

  it('keeps incomplete questions ahead of recalculation', async () => {
    const journey = createJourney()
    journey.state().howMuchWater = 100000
    delete journey.state().otherAnswer

    const result = await journey.dispatch('/grant/summary')

    expect(result.location).toBe('/grant/other-details')
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(205000)
  })

  it('omits both the detour and saved calculated rows when their page becomes inapplicable', async () => {
    const journey = createJourney()
    const edit = await journey.dispatch('/grant/amount?returnUrl=%2Fgrant%2Fsummary', {
      method: 'post',
      payload: { action: 'validate', howMuchWater: '0' }
    })

    const summary = await journey.dispatch(edit.location)

    expect(summary.viewName).toBe('check-responses-page')
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(205000)
    expect(summary.viewModel.checkAnswers.flatMap((section) => section.summaryList.rows)).not.toContainEqual(
      expect.objectContaining({ key: { text: 'Total estimated cost' } })
    )
  })

  it('refreshes a calculated result without a page visit and checks it again on GET and POST', async () => {
    const journey = createJourney(AutomaticResultController)
    const persist = vi.spyOn(journey.costPage, 'setState')
    journey.state().howMuchWater = 200000

    const summary = await journey.dispatch('/grant/summary')

    expect(summary.viewName).toBe('check-responses-page')
    expect(summary.viewModel.checkAnswers[0].summaryList.rows).toContainEqual({
      key: { text: 'Total estimated cost' },
      value: { text: 500000 }
    })
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(500000)
    expect(persist).toHaveBeenCalledTimes(1)

    const revisited = await journey.dispatch('/grant/summary')
    expect(revisited.viewName).toBe('check-responses-page')
    expect(persist).toHaveBeenCalledTimes(1)

    journey.state().howMuchWater = 300000
    const submitted = await journey.dispatch('/grant/summary', { method: 'post', payload: { action: 'continue' } })
    expect(submitted.location).toBe('/grant/declaration')
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(750000)
    expect(persist).toHaveBeenCalledTimes(2)
  })
})

async function openReservoirListFromCheckAnswers(journey) {
  const summary = await journey.dispatch('/grant/summary')
  const changeLink = summary.viewModel.checkAnswers
    .flatMap((section) => section.answerGroups ?? [])
    .flatMap((answers) => answers.card?.actions?.items ?? [])
    .find((action) => action.href.includes('/reservoir-items/summary'))
  const list = await journey.dispatch(changeLink.href)
  return { list, listHref: changeLink.href }
}

function reservoirActions(list) {
  return list.viewModel.checkAnswers[0].summaryList.rows[0].actions.items
}

describe('water-management reservoir navigation from Check answers', () => {
  it.each(['continue', 'back'])('returns an unchanged item to the list via %s before Check answers', async (action) => {
    const journey = createJourney(TotalEstimatedCostTaskPageController, { withRepeater: true })
    const { list, listHref } = await openReservoirListFromCheckAnswers(journey)
    const editHref = reservoirActions(list)[0].href
    const edit = await journey.dispatch(editHref)
    expect(edit.viewModel.backLink).toEqual({ href: listHref, text: 'Go back to reservoir list' })

    const result =
      action === 'back'
        ? { location: edit.viewModel.backLink.href }
        : await journey.dispatch(editHref, {
            method: 'post',
            payload: { action: 'validate', ...journey.state().reservoirItems[0] }
          })
    expect(result.location).toBe(listHref)
    const returnedList = await journey.dispatch(result.location)
    expect(returnedList.viewName).toBe('repeat-list-summary')
    expect(reservoirActions(returnedList)[0].href).toBe(editHref)

    const continued = await journey.dispatch(result.location, { method: 'post', payload: { action: 'continue' } })
    expect(continued.location).toBe('/grant/summary')
    const checkAnswers = await journey.dispatch(continued.location)
    expect(checkAnswers.viewName).toBe('check-responses-page')
  })

  it('returns a changed item to the list and recalculates only after list Continue', async () => {
    const journey = createJourney(TotalEstimatedCostTaskPageController, { withRepeater: true })
    const { list, listHref } = await openReservoirListFromCheckAnswers(journey)
    const originalTotal = journey.state().additionalAnswers.totalEstimatedCost
    const edit = await journey.dispatch(reservoirActions(list)[0].href, {
      method: 'post',
      payload: { action: 'validate', ...journey.state().reservoirItems[0], reservoirItemHowMuchWater: '200000' }
    })

    expect(edit.location).toBe(listHref)
    const returnedList = await journey.dispatch(edit.location)
    expect(returnedList.viewName).toBe('repeat-list-summary')
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBe(originalTotal)
    const continued = await journey.dispatch(edit.location, { method: 'post', payload: { action: 'continue' } })
    expect(continued.location).toBe('/grant/summary')
    const detour = await journey.dispatch(continued.location)
    expect(detour.location).toBe('/grant/total-estimated-cost?returnUrl=%2Fgrant%2Fsummary')

    await journey.dispatch(detour.location)
    expect(journey.state().additionalAnswers.totalEstimatedCost).toBeGreaterThan(originalTotal)
    const confirmed = await journey.dispatch(detour.location, { method: 'post', payload: { action: 'continue' } })
    expect(confirmed.location).toBe('/grant/summary')
    const checkAnswers = await journey.dispatch(confirmed.location)
    expect(checkAnswers.viewName).toBe('check-responses-page')
  })

  it.each(['back', 'cancel', 'confirm'])('returns delete %s to the list before onward navigation', async (action) => {
    const journey = createJourney(TotalEstimatedCostTaskPageController, { withRepeater: true })
    const { list, listHref } = await openReservoirListFromCheckAnswers(journey)
    const deleteHref = reservoirActions(list)[1].href
    const deletePage = await journey.dispatch(deleteHref)
    expect(deletePage.viewName).toBe('item-delete')
    expect(deletePage.viewModel.backLink).toEqual({ href: listHref, text: 'Back' })

    const result =
      action === 'back'
        ? { location: deletePage.viewModel.backLink.href }
        : await journey.dispatch(deleteHref, { method: 'post', payload: { confirm: action === 'confirm' } })
    expect(result.location).toBe(listHref)
    const returnedList = await journey.dispatch(result.location)
    expect(returnedList.viewName).toBe('repeat-list-summary')
    expect(journey.state().reservoirItems).toHaveLength(action === 'confirm' ? 1 : 2)
    const continued = await journey.dispatch(result.location, { method: 'post', payload: { action: 'continue' } })
    expect(continued.location).toBe('/grant/summary')
    const checkAnswers = await journey.dispatch(continued.location)
    if (action === 'confirm') {
      expect(checkAnswers.location).toBe('/grant/total-estimated-cost?returnUrl=%2Fgrant%2Fsummary')
    } else {
      expect(checkAnswers.viewName).toBe('check-responses-page')
    }
  })

  it('returns an added item to the list before recalculating', async () => {
    const journey = createJourney(TotalEstimatedCostTaskPageController, { withRepeater: true })
    const { listHref } = await openReservoirListFromCheckAnswers(journey)
    const add = await journey.dispatch(listHref, { method: 'post', payload: { action: 'add-another' } })
    const item = await journey.dispatch(add.location)
    expect(item.viewModel.backLink).toEqual({ href: listHref, text: 'Go back to reservoir list' })
    const saved = await journey.dispatch(add.location, {
      method: 'post',
      payload: {
        action: 'validate',
        reservoirItemName: 'New reservoir',
        reservoirItemWhatTypeOfReservoir: 'clay',
        reservoirItemHowMuchWater: '100000'
      }
    })
    expect(saved.location).toBe(listHref)
    const list = await journey.dispatch(saved.location)
    expect(list.viewName).toBe('repeat-list-summary')
    expect(journey.state().reservoirItems).toHaveLength(3)
    const continued = await journey.dispatch(saved.location, { method: 'post', payload: { action: 'continue' } })
    const checkAnswers = await journey.dispatch(continued.location)
    expect(checkAnswers.location).toBe('/grant/total-estimated-cost?returnUrl=%2Fgrant%2Fsummary')
  })
})
