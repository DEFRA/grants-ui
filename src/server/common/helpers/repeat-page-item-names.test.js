import { randomUUID } from 'node:crypto'
import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import { RepeatPageController } from '@defra/forms-engine-plugin/controllers/RepeatPageController.js'
import { enableRepeatPageItemNames } from './repeat-page-item-names.js'
import { createPageRenderer } from '../test-helpers/component-helpers.js'

vi.unmock('@defra/forms-model')

const templateContext = { evaluate: (value) => value }
const renderList = createPageRenderer(import.meta.url, 'repeat-list-summary.html', templateContext)
const renderDelete = createPageRenderer(import.meta.url, 'item-delete.html', templateContext)
const normalise = (value) => value.replace(/\s+/g, ' ').trim()

// No task list or section: wording applies to every resolved repeat page.
function createPage({ title = 'Reservoir', min = 1, max = 5, count = 2 } = {}) {
  const model = new FormModel(
    {
      name: 'Repeat wording test',
      engine: 'V2',
      startPage: '/reservoirs',
      sections: [],
      lists: [],
      conditions: [],
      pages: [
        {
          path: '/reservoirs',
          title: 'Reservoir details',
          controller: 'RepeatPageController',
          repeat: { options: { name: 'reservoirs', title }, schema: { min, max } },
          components: [{ type: 'TextField', name: 'name', title: 'Reservoir name' }]
        },
        { path: '/next', title: 'Next page', components: [] }
      ]
    },
    { basePath: 'grant' },
    { formsService: { getFormMetadata: async () => ({}) } }
  )
  const state = {
    $$__referenceNumber: 'test-reference',
    reservoirs: Array.from({ length: count }, () => ({ itemId: randomUUID(), name: 'North reservoir' }))
  }
  const request = {
    method: 'get',
    path: '/grant/reservoirs/summary',
    query: {},
    params: { slug: 'grant', path: 'reservoirs' },
    app: { model },
    server: { plugins: { 'forms-engine-plugin': {} } }
  }
  const page = model.pageMap.get('/reservoirs')
  const context = model.getFormContext(request, state)
  const h = { view: vi.fn((_viewName, viewModel) => viewModel), redirect: vi.fn(() => ({ code: () => ({}) })) }
  enableRepeatPageItemNames(request)
  return { page, request, context, state, h }
}

describe('repeat page item names with the forms engine', () => {
  it.each([
    [1, 'Reservoir', 'You have added 1 reservoir'],
    [2, 'Reservoir', 'You have added 2 reservoirs'],
    [5, 'Storage Tank', 'You have added 5 storage tanks'],
    [1, 'Business', 'You have added 1 business'],
    [2, 'Business', 'You have added 2 businesses'],
    [2, 'Person', 'You have added 2 people'],
    [2, 'Sheep', 'You have added 2 sheep']
  ])('names %i items using %s in the heading and document title', (count, title, expected) => {
    const { page, request, context, state } = createPage({ title, count })
    const viewModel = page.getListSummaryViewModel(request, context, state.reservoirs)
    const $ = renderList(viewModel)

    expect(normalise($('h1').text())).toBe(expected)
    expect($('title').text()).toContain(expected)
    expect($('.govuk-summary-list__key').first().text()).toContain(`${title} 1`)
    expect(page).toBeInstanceOf(RepeatPageController)
    expect(page.repeat.options.title).toBe(title)
  })

  it.each([
    [2, 5, 1, 'continue', 'You must add at least 2 reservoirs'],
    [1, 5, 5, 'add-another', 'You can only add up to 5 reservoirs'],
    [1, 5, 6, 'continue', 'You can only add up to 5 reservoirs'],
    [1, 1, 1, 'add-another', 'You can only add up to 1 reservoir']
  ])('names validation limits min=%i max=%i count=%i action=%s', (min, max, count, action, expected) => {
    const { page, request, context, h } = createPage({ min, max, count })
    const viewModel = page.makePostListSummaryRouteHandler()(
      { ...request, method: 'post', payload: { action } },
      context,
      h
    )
    const $ = renderList(viewModel)

    expect(viewModel.errors[0].text).toBe(expected)
    expect(normalise($('.govuk-error-summary__list').text())).toBe(expected)
    expect(h.view).toHaveBeenCalledWith('repeat-list-summary', viewModel)
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it.each([
    [2, 5, 1, 'continue', 'You must add at least 2 people'],
    [1, 2, 2, 'add-another', 'You can only add up to 2 people']
  ])(
    'pluralises irregular item names in validation limits min=%i max=%i count=%i action=%s',
    (min, max, count, action, expected) => {
      const { page, request, context, h } = createPage({ title: 'Person', min, max, count })
      const viewModel = page.makePostListSummaryRouteHandler()(
        { ...request, method: 'post', payload: { action } },
        context,
        h
      )
      const $ = renderList(viewModel)

      expect(viewModel.errors[0].text).toBe(expected)
      expect(normalise($('.govuk-error-summary__list').text())).toBe(expected)
    }
  )

  it('preserves unrelated validation messages and error properties', () => {
    const { page, request, context, state } = createPage()
    context.errors = [{ text: 'Enter an answer', path: ['name'], href: '#name', name: 'name' }]
    const viewModel = page.getListSummaryViewModel(request, context, state.reservoirs)

    expect(viewModel.errors).toEqual(context.errors)
  })

  it('names the item in the delete heading without changing the shared toolkit', () => {
    const { page, request, context, state, h } = createPage({ title: 'Storage Tank' })
    request.params.itemId = state.reservoirs[0].itemId
    const originalView = h.view
    const viewModel = page.makeGetItemDeleteRouteHandler()(request, context, h)
    const $ = renderDelete(viewModel)

    expect(normalise($('h1').text())).toBe('Are you sure you want to remove this storage tank?')
    expect($('title').text()).toContain('Are you sure you want to remove this storage tank?')
    expect(viewModel.itemTitle).toBe('Storage Tank 1')
    expect(h.view).toBe(originalView)
    expect(h.view).toHaveBeenCalledWith('item-delete', viewModel, undefined)
  })

  it.each([true, false])('preserves the delete guard for an existing item: %s', (exists) => {
    const { page, request, context, state, h } = createPage({ count: 1 })
    request.params.itemId = exists ? state.reservoirs[0].itemId : randomUUID()

    expect(() => page.makeGetItemDeleteRouteHandler()(request, context, h)).toThrow(
      exists ? 'Last list item cannot be removed' : 'List item to remove not found'
    )
    expect(h.view).not.toHaveBeenCalled()
  })

  it('decorates each cached repeat controller once and leaves other pages alone', () => {
    const { page, request } = createPage()
    const getListSummaryViewModel = page.getListSummaryViewModel
    const makeGetItemDeleteRouteHandler = page.makeGetItemDeleteRouteHandler
    enableRepeatPageItemNames(request)

    expect(page.getListSummaryViewModel).toBe(getListSummaryViewModel)
    expect(page.makeGetItemDeleteRouteHandler).toBe(makeGetItemDeleteRouteHandler)

    const nextPage = request.app.model.pageMap.get('/next')
    const getViewModel = nextPage.getViewModel
    enableRepeatPageItemNames({ ...request, params: { ...request.params, path: 'next' } })
    expect(nextPage.getViewModel).toBe(getViewModel)
    expect(() => enableRepeatPageItemNames({ app: {} })).not.toThrow()
  })
})
