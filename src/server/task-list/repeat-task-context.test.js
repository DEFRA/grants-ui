import { randomUUID } from 'node:crypto'
import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import { redirectOrMakeHandler } from '@defra/forms-engine-plugin/engine/routes/index.js'
import { RepeatPageController } from '@defra/forms-engine-plugin/controllers/RepeatPageController.js'
import TaskListPageController from './task-list-page.controller.js'
import TaskPageController from './task-page.controller.js'
import { enableRepeatTaskContext } from './repeat-task-context.js'
import { enableRepeatPageItemNames } from '../common/helpers/repeat-page-item-names.js'
import { buildTaskListData, getCompletionStats } from './task-list.helper.js'

// Use the installed engine to cover its repeat validation and handler dispatch.
vi.unmock('@defra/forms-model')
vi.mock('@defra/forms-engine-plugin/controllers/QuestionPageController.js', () =>
  vi.importActual('@defra/forms-engine-plugin/engine/pageControllers/QuestionPageController.js')
)

const makeItem = (overrides = {}) => ({
  itemId: randomUUID(),
  itemName: 'Item',
  quantity: 0,
  notes: null,
  ...overrides
})

function createJourney({ tasklist = {}, min = 1, max = 3, sameSection = false, section = 'items', components } = {}) {
  const model = new FormModel(
    {
      name: 'Repeat task test',
      engine: 'V2',
      startPage: '/task-list',
      sections: [
        { name: 'items', title: 'Items' },
        { name: 'other', title: 'Other details' }
      ],
      lists: [],
      conditions: [],
      metadata: { tasklist },
      pages: [
        { path: '/task-list', title: 'Tasks', controller: 'TaskListPageController', components: [] },
        {
          path: '/items',
          title: 'Items',
          section,
          controller: 'RepeatPageController',
          repeat: { options: { name: 'items', title: 'Item' }, schema: { min, max } },
          components: components ?? [
            { type: 'TextField', name: 'itemName', title: 'Item name' },
            { type: 'NumberField', name: 'quantity', title: 'Quantity' },
            { type: 'TextField', name: 'notes', title: 'Notes', options: { required: false } }
          ]
        },
        {
          path: '/other',
          title: 'Other details',
          section: sameSection ? 'items' : 'other',
          controller: 'TaskPageController',
          components: [{ type: 'TextField', name: 'otherAnswer', title: 'Other answer' }]
        },
        { path: '/summary', title: 'Check answers', controller: 'SummaryPageController', components: [] }
      ]
    },
    { basePath: 'grant' },
    { formsService: { getFormMetadata: async () => ({}) } },
    { TaskListPageController, TaskPageController }
  )
  const page = model.pageMap.get('/items')
  let state = { $$__referenceNumber: 'test-reference', items: [makeItem()], otherAnswer: 'Provided' }
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
  const saveAndExit = vi.fn(() => response({ location: '/saved' }))
  const h = {
    continue: Symbol('continue'),
    redirect: (location) => response({ location }),
    view: (viewName, viewModel) => response({ viewName, viewModel })
  }
  const requestFor = (path, method = 'get', payload) => {
    const url = new URL(path, 'http://localhost')
    const [pagePath, itemId] = url.pathname.replace('/grant/', '').split('/')
    return {
      method,
      payload,
      url,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      params: { slug: 'grant', path: pagePath, itemId: itemId === 'summary' ? undefined : itemId },
      app: { model },
      yar: { flash: () => [] },
      server: { plugins: { 'forms-engine-plugin': { cacheService, saveAndExit } } }
    }
  }

  return {
    model,
    page,
    saveAndExit,
    state: () => state,
    taskViewModel: { serviceUrl: '/grant', page: { def: model.def } },
    enable: () => enableRepeatTaskContext(requestFor('/grant/items')),
    async dispatch(path, { method = 'get', payload } = {}) {
      const request = requestFor(path, method, payload)
      return redirectOrMakeHandler(
        request,
        h,
        () => {
          enableRepeatPageItemNames(request)
          enableRepeatTaskContext(request)
          return h.continue
        },
        (resolvedPage, context) => {
          const isSummary = request.path.endsWith('/summary') && request.params.path === 'items'
          const isDelete = request.path.endsWith('/confirm-delete')
          let factory = method === 'get' ? 'makeGetRouteHandler' : 'makePostRouteHandler'
          if (isSummary) {
            factory = method === 'get' ? 'makeGetListSummaryRouteHandler' : 'makePostListSummaryRouteHandler'
          } else if (isDelete) {
            factory = method === 'get' ? 'makeGetItemDeleteRouteHandler' : 'makePostItemDeleteRouteHandler'
          }
          return resolvedPage[factory]()(request, context, h)
        }
      )
    }
  }
}

describe('repeat task context with the forms engine', () => {
  it('keeps the repeat identity and decorates each cached controller once', () => {
    const journey = createJourney()
    const getNextPath = journey.page.getNextPath
    journey.enable()
    const getViewModel = journey.page.getViewModel
    const makePostSummary = journey.page.makePostListSummaryRouteHandler
    journey.enable()

    expect(journey.page).toBeInstanceOf(RepeatPageController)
    expect(journey.page.pageDef.controller).toBe('RepeatPageController')
    expect(journey.page.repeat.options.name).toBe('items')
    expect(journey.page.getViewModel).toBe(getViewModel)
    expect(journey.page.makePostListSummaryRouteHandler).toBe(makePostSummary)
    expect(journey.page.getNextPath).toBe(getNextPath)
    expect(journey.page.getNextPath({ evaluationState: {} })).toBe('/other')
  })

  it('links item views to the repeat list and the summary to the task list', async () => {
    const journey = createJourney()
    const item = await journey.dispatch(`/grant/items/${journey.state().items[0].itemId}`)
    const summary = await journey.dispatch('/grant/items/summary')

    expect(item.statusCode).toBe(200)
    expect(item.viewModel.backLink).toEqual({ href: '/grant/items/summary', text: 'Go back to item list' })
    expect(summary.statusCode).toBe(200)
    expect(summary.viewModel.backLink).toEqual({ href: '/grant/task-list', text: 'Back to task list' })
    expect(summary.viewName).toBe('repeat-list-summary')
  })

  it('adds a task list link to both views when returnAfterSection is false', async () => {
    const journey = createJourney({ tasklist: { returnAfterSection: false } })
    const item = await journey.dispatch(`/grant/items/${journey.state().items[0].itemId}`)
    const summary = await journey.dispatch('/grant/items/summary')

    for (const result of [item, summary]) {
      expect(result.viewModel.backToTaskList).toEqual({ href: '/grant/task-list', text: 'Back to task list' })
    }
    const continued = await journey.dispatch('/grant/items/summary', {
      method: 'post',
      payload: { action: 'continue' }
    })
    expect(continued.location).toBe('/grant/other')
  })

  it.each([
    [false, '/grant/task-list'],
    [true, '/grant/other']
  ])('uses task navigation on summary Continue with sameSection=%s', async (sameSection, expected) => {
    const journey = createJourney({ sameSection })
    const result = await journey.dispatch('/grant/items/summary', { method: 'post', payload: { action: 'continue' } })

    expect(result.statusCode).toBe(303)
    expect(result.location).toBe(expected)
    // The engine still walks the original page sequence after summary dispatch.
    const other = await journey.dispatch('/grant/other')
    expect(other.statusCode).toBe(200)
  })

  it('honours returnUrl on edits and summary Continue', async () => {
    const journey = createJourney()
    const itemId = journey.state().items[0].itemId
    const editPath = `/grant/items/${itemId}?returnUrl=%2Fgrant%2Fitems%2Fsummary`
    const view = await journey.dispatch(editPath)
    expect(view.viewModel.backLink).toEqual({ href: '/grant/items/summary', text: 'Go back to item list' })

    const edit = await journey.dispatch(editPath, {
      method: 'post',
      payload: { action: 'validate', itemName: 'Changed', quantity: '2', notes: '' }
    })
    expect(edit.location).toBe('/grant/items/summary')
    expect(journey.state().items[0]).toMatchObject({ itemId, itemName: 'Changed', quantity: 2 })

    const summary = await journey.dispatch('/grant/items/summary?returnUrl=%2Fgrant%2Fsummary')
    expect(summary.viewModel.backLink.href).toBe('/grant/summary')
    const continued = await journey.dispatch('/grant/items/summary?returnUrl=%2Fgrant%2Fsummary', {
      method: 'post',
      payload: { action: 'continue' }
    })
    expect(continued.location).toBe('/grant/summary')
  })

  it('keeps new item creation, add-another and deletion within the repeat page', async () => {
    const journey = createJourney()
    journey.state().items = []
    const start = await journey.dispatch('/grant/items')
    expect(start.location).toMatch(/^\/grant\/items\/[\da-f-]{36}$/)
    const saved = await journey.dispatch(start.location, {
      method: 'post',
      payload: { action: 'validate', itemName: 'First', quantity: '1', notes: '' }
    })
    expect(saved.location).toBe('/grant/items/summary')

    const add = await journey.dispatch('/grant/items/summary', { method: 'post', payload: { action: 'add-another' } })
    expect(add.location).toMatch(/^\/grant\/items\/[\da-f-]{36}$/)
    await journey.dispatch(add.location, {
      method: 'post',
      payload: { action: 'validate', itemName: 'Second', quantity: '2', notes: '' }
    })
    expect(journey.state().items).toHaveLength(2)

    const deletePath = `${add.location}/confirm-delete`
    const confirm = await journey.dispatch(deletePath)
    expect(confirm.viewName).toBe('item-delete')
    expect(confirm.viewModel.pageTitle).toBe('Are you sure you want to remove this item?')
    expect(confirm.viewModel.backLink).toEqual({ href: '/grant/items/summary', text: 'Back' })
    const deleted = await journey.dispatch(deletePath, { method: 'post', payload: { confirm: true } })
    expect(deleted.location).toBe('/grant/items/summary')
    expect(journey.state().items).toHaveLength(1)
  })

  it.each([
    [2, 3, 1, 'continue', 'You must add at least 2 items'],
    [1, 2, 2, 'add-another', 'You can only add up to 2 items'],
    [1, 2, 3, 'continue', 'You can only add up to 2 items']
  ])('preserves list limits min=%i max=%i count=%i action=%s', async (min, max, count, action, text) => {
    const journey = createJourney({ min, max })
    journey.state().items = Array.from({ length: count }, () => makeItem())
    const result = await journey.dispatch('/grant/items/summary', { method: 'post', payload: { action } })

    expect(result.statusCode).toBe(200)
    expect(result.viewName).toBe('repeat-list-summary')
    expect(result.viewModel.errors[0].text).toBe(text)
    expect(result.viewModel.backLink.href).toBe('/grant/task-list')
  })

  it('preserves item validation errors and save-and-exit', async () => {
    const journey = createJourney()
    const invalid = await journey.dispatch(`/grant/items/${journey.state().items[0].itemId}`, {
      method: 'post',
      payload: { action: 'validate', itemName: '', quantity: 'invalid' }
    })
    expect(invalid.statusCode).toBe(200)
    expect(invalid.viewModel.errors.length).toBeGreaterThan(0)
    expect(journey.state().items[0].itemName).toBe('Item')

    const saved = await journey.dispatch('/grant/items/summary', {
      method: 'post',
      payload: { action: 'save-and-exit' }
    })
    expect(saved.location).toBe('/saved')
    expect(journey.saveAndExit).toHaveBeenCalledOnce()
  })

  it('leaves repeat pages without a task section unchanged', async () => {
    const journey = createJourney({ section: undefined })
    delete journey.page.pageDef.section
    const original = journey.page.makePostListSummaryRouteHandler
    const result = await journey.dispatch('/grant/items/summary', { method: 'post', payload: { action: 'continue' } })

    expect(result.location).toBe('/grant/other')
    expect(journey.page.makePostListSummaryRouteHandler).toBe(original)
  })

  it('leaves repeat pages without a task list unchanged', () => {
    const journey = createJourney()
    journey.model.pages = journey.model.pages.filter((page) => !(page instanceof TaskListPageController))
    const original = journey.page.getViewModel
    journey.enable()
    expect(journey.page.getViewModel).toBe(original)
  })
})

describe('repeat task completion with the forms engine', () => {
  it.each([
    ['missing list', undefined, false],
    ['empty list', [], false],
    ['non-list value', 'invalid', false],
    ['top-level answers only', undefined, false],
    ['valid item with blank optional notes', [makeItem()], true],
    ['missing required answer', [makeItem({ itemName: undefined })], false],
    ['null required answer', [makeItem({ itemName: null })], false],
    ['null required number', [makeItem({ quantity: null })], false],
    ['empty required answer', [makeItem({ itemName: '' })], false],
    ['invalid number', [makeItem({ quantity: 'invalid' })], false],
    ['missing item identity', [makeItem({ itemId: undefined })], false],
    ['invalid later item', [makeItem(), makeItem({ quantity: undefined })], false]
  ])('checks %s in nested repeat state', (_label, items, completed) => {
    const journey = createJourney()
    const state = { items, itemName: 'Top-level value', quantity: 1, otherAnswer: 'Provided' }
    const stats = getCompletionStats(journey.taskViewModel, journey.model, state)
    const tasks = buildTaskListData(journey.taskViewModel, journey.model, state)

    expect(stats).toEqual({ completed: completed ? 2 : 1, total: 2, isComplete: completed })
    expect(tasks[0].items[0].status.tag.text).toBe(completed ? 'Completed' : 'Not started')
  })

  it.each([
    [2, 3, 1, false],
    [2, 3, 2, true],
    [2, 3, 3, true],
    [2, 3, 4, false]
  ])('checks repeat limits min=%i max=%i count=%i', (min, max, count, completed) => {
    const journey = createJourney({ min, max })
    journey.state().items = Array.from({ length: count }, () => makeItem())
    expect(getCompletionStats(journey.taskViewModel, journey.model, journey.state()).isComplete).toBe(completed)
  })

  it('honours completion requirements as well as the repeat schema', () => {
    const journey = createJourney({
      tasklist: {
        completionRequirements: {
          '/items': { requiresAnyItemWithNonEmptyKey: { collection: 'supportingAnswers', key: 'actions' } }
        }
      }
    })
    expect(getCompletionStats(journey.taskViewModel, journey.model, journey.state()).isComplete).toBe(false)
    journey.state().supportingAnswers = [{ actions: ['Provided'] }]
    expect(getCompletionStats(journey.taskViewModel, journey.model, journey.state()).isComplete).toBe(true)
    journey.state().items[0].quantity = 'invalid'
    expect(getCompletionStats(journey.taskViewModel, journey.model, journey.state()).isComplete).toBe(false)
  })

  it.each([
    [null, null, null, false],
    [1, null, 2026, false],
    [1, 11, 2026, true]
  ])('checks required compound answers day=%s month=%s year=%s', (day, month, year, completed) => {
    const journey = createJourney({
      components: [{ type: 'DatePartsField', name: 'date', title: 'Date' }]
    })
    journey.state().items = [{ itemId: randomUUID(), date__day: day, date__month: month, date__year: year }]
    expect(getCompletionStats(journey.taskViewModel, journey.model, journey.state()).isComplete).toBe(completed)
  })

  it('counts false as an answered required yes/no field', () => {
    const journey = createJourney({ components: [{ type: 'YesNoField', name: 'answer', title: 'Answer' }] })
    journey.state().items = [{ itemId: randomUUID(), answer: false }]
    expect(getCompletionStats(journey.taskViewModel, journey.model, journey.state()).isComplete).toBe(true)
  })

  it('excludes a repeat task when its condition is false', () => {
    const journey = createJourney()
    journey.page.pageDef.condition = 'includeItems'
    journey.model.conditions.includeItems = {}
    vi.spyOn(journey.model, 'makeCondition').mockReturnValue({ fn: () => false })
    journey.state().items = []

    expect(getCompletionStats(journey.taskViewModel, journey.model, journey.state())).toEqual({
      completed: 1,
      total: 1,
      isComplete: true
    })
    expect(buildTaskListData(journey.taskViewModel, journey.model, journey.state())[0].items).toEqual([])
  })

  it.each([true, false])(
    'unlocks the next task only after the list is valid with showQuestions=%s',
    (showQuestions) => {
      const journey = createJourney({ min: 2, tasklist: { showQuestions } })
      journey.state().otherAnswer = undefined
      const before = buildTaskListData(journey.taskViewModel, journey.model, journey.state())
      const nextBefore = showQuestions ? before[1].items[0] : before[0].items[1]
      expect(nextBefore.status.tag.text).toBe('Cannot start yet')
      expect(nextBefore.href).toBeUndefined()

      journey.state().items.push(makeItem())
      const after = buildTaskListData(journey.taskViewModel, journey.model, journey.state())
      const nextAfter = showQuestions ? after[1].items[0] : after[0].items[1]
      expect(nextAfter.status.tag.text).toBe('Not started')
      expect(nextAfter.href).toBe('/grant/other')
    }
  )
})
