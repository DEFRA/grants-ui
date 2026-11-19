import Hapi from '@hapi/hapi'
import { FormModel } from '@defra/forms-engine-plugin/engine/models/FormModel.js'
import { getRoutes } from '@defra/forms-engine-plugin/engine/routes/questions.js'
import { makeLoadFormPreHandler } from '@defra/forms-engine-plugin/engine/routes/index.js'
import { transformAnswerKeysToText } from '../../declaration/state-to-gas-answers-mapper.js'
import { normaliseNumberInputs } from './normalise-number-inputs.js'

vi.unmock('@defra/forms-model')

const servers = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()))
})

/** Exercise the Hapi lifecycle, engine validation, and normal persistence path. */
async function journey({ schema = {}, options = {}, repeat = false } = {}) {
  const definition = {
    name: 'Number input test',
    engine: 'V2',
    startPage: '/amount',
    sections: [],
    lists: [],
    conditions: [],
    pages: [
      {
        path: '/amount',
        title: 'Amount',
        ...(repeat && {
          controller: 'RepeatPageController',
          repeat: { options: { name: 'items', title: 'Item' }, schema: { min: 1, max: 5 } }
        }),
        components: [
          { type: 'NumberField', name: 'amount', title: 'Amount', options, schema },
          { type: 'TextField', name: 'notes', title: 'Notes', options: { required: false } },
          {
            type: 'NumberField',
            name: 'secondAmount',
            title: 'Second amount',
            options: { required: false },
            schema: { precision: 2 }
          }
        ]
      },
      {
        path: '/other',
        title: 'Other amount',
        components: [{ type: 'NumberField', name: 'otherAmount', title: 'Other amount' }]
      }
    ]
  }
  const model = new FormModel(
    definition,
    { basePath: 'test-grant' },
    { formsService: { getFormMetadata: async () => ({}) } }
  )
  let state = { $$__referenceNumber: 'test-reference', auxiliaryState: 'keep' }
  let context
  const cacheService = {
    getState: async () => structuredClone(state),
    setState: vi.fn(async (_request, value) => {
      state = structuredClone(value)
      return state
    }),
    getFlash: () => undefined
  }
  const server = Hapi.server()
  servers.push(server)
  server.app.model = model
  server.plugins['forms-engine-plugin'] = { cacheService }
  server.decorate('toolkit', 'view', function (template, viewModel) {
    return this.response({ template, errors: viewModel.errors, components: viewModel.components })
  })
  server.ext('onRequest', (request, h) => {
    request.yar = { flash: () => [] }
    request.app.stateWithDefinition = Promise.resolve({ definition: { definition } })
    return h.continue
  })
  server.ext('onPreHandler', normaliseNumberInputs)
  await server.register({
    name: '@defra/forms-engine-plugin',
    register(pluginServer) {
      const routeOptions = { pre: [{ method: makeLoadFormPreHandler(pluginServer, {}) }] }
      pluginServer.route(
        getRoutes(routeOptions, routeOptions, undefined, (_request, h, formContext) => {
          context = formContext
          return h.continue
        })
      )
    }
  })
  return {
    server,
    model,
    cacheService,
    state: () => state,
    context: () => context,
    post: (amount, extra = {}, path = '/test-grant/amount') =>
      server.inject({
        method: 'POST',
        url: path,
        payload: { action: 'validate', notes: '', secondAmount: '', amount, ...extra }
      })
  }
}

describe('number input normalisation with the forms engine', () => {
  test.each([
    ['1000', 1000],
    ['10000', 10000],
    ['1000.50', 1000.5],
    ['1000000', 1000000],
    ['1,000', 1000],
    ['10,000', 10000],
    ['1,000.50', 1000.5],
    ['1,000,000', 1000000],
    ['1,234,567.89', 1234567.89],
    ['-1,000.50', -1000.5],
    ['+1,000', 1000],
    [' 1,000.50 ', 1000.5]
  ])('validates and saves %s as the number %s', async (input, expected) => {
    const form = await journey({ schema: { precision: 2 } })
    const result = await form.post(input, { notes: '1,000' })

    expect(result.statusCode).toBe(303)
    expect(form.cacheService.setState).toHaveBeenCalledOnce()
    expect(form.state()).toMatchObject({ amount: expected, notes: '1,000', auxiliaryState: 'keep' })
    expect(form.context().relevantState.amount).toBe(expected)
    expect(
      transformAnswerKeysToText(form.context().relevantState, form.model.componentDefMap, new Map())
    ).toMatchObject({
      amount: expected
    })

    const page = form.model.pageMap.get('/amount')
    expect(page.getFormDataFromState(undefined, form.state()).amount).toBe(expected)
  })

  test.each([
    '1,2,3',
    '10,0',
    '1,,000',
    ',1000',
    '1,000.5,0',
    '1000,000',
    '1,000,',
    '1,00',
    '1,000.000,00',
    '1, 000',
    '1.000,50',
    '£1,000',
    '1,000abc',
    '1,000e3',
    '£1000'
  ])('shows a field error for %s without saving', async (input) => {
    const form = await journey()
    const result = await form.post(input)

    expect(result.statusCode).toBe(200)
    expect(form.context().errors).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'amount' })]))
    expect(result.result.errors).toHaveLength(1)
    expect(result.result.components[0].model.value).toBe(input)
    expect(form.cacheService.setState).not.toHaveBeenCalled()
    expect(form.state()).not.toHaveProperty('amount')
  })

  test.each([
    [{ precision: 0 }, '1,000.50', 'Amount must be a whole number'],
    [{ precision: 2 }, '1,000.123', 'Amount must have 2 or fewer decimal places'],
    [{ min: 2000 }, '1,000', 'Amount must be 2000 or higher'],
    [{ max: 999 }, '1,000', 'Amount must be 999 or lower']
  ])('retains schema %j for %s', async (schema, input, errorText) => {
    const form = await journey({ schema })
    const result = await form.post(input)

    expect(result.statusCode).toBe(200)
    expect(form.context().errors).toEqual(expect.arrayContaining([expect.objectContaining({ text: errorText })]))
    expect(form.cacheService.setState).not.toHaveBeenCalled()
  })

  test('retains custom number validation messages', async () => {
    const form = await journey({ options: { customValidationMessage: 'Enter a valid amount' } })
    const result = await form.post('1,,000')

    expect(result.result.errors[0].text).toBe('Enter a valid amount')
  })

  test('normalises multiple numeric answers while preserving text answers', async () => {
    const form = await journey()
    const result = await form.post('1,000', { secondAmount: '20,000.50', notes: '30,000' })

    expect(result.statusCode).toBe(303)
    expect(form.state()).toMatchObject({ amount: 1000, secondAmount: 20000.5, notes: '30,000' })
  })

  test('accepts grouped whole numbers in an integer field', async () => {
    const form = await journey({ schema: { precision: 0 } })
    expect((await form.post('10,000')).statusCode).toBe(303)
    expect(form.state().amount).toBe(10000)
  })

  test('shows the saved number without commas when returning to the page', async () => {
    const form = await journey()
    await form.post('10,000')
    const result = await form.server.inject('/test-grant/amount')

    expect(result.statusCode).toBe(200)
    expect(result.result.components[0].model.value).toBe(10000)
  })

  test('preserves the saved answer when an edited value has malformed grouping', async () => {
    const form = await journey()
    await form.post('10,000')
    form.cacheService.setState.mockClear()
    const result = await form.post('1,2,3')

    expect(result.statusCode).toBe(200)
    expect(result.result.components[0].model.value).toBe('1,2,3')
    expect(form.cacheService.setState).not.toHaveBeenCalled()
    expect(form.state().amount).toBe(10000)
  })

  test('retains required and optional empty field behaviour', async () => {
    const required = await journey()
    await required.post('')
    expect(required.context().errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'Enter amount' })])
    )
    expect(required.cacheService.setState).not.toHaveBeenCalled()

    const optional = await journey({ options: { required: false } })
    expect((await optional.post('')).statusCode).toBe(303)
    expect(optional.state().amount).toBeNull()
  })

  test('saves a numeric answer inside a repeat item', async () => {
    const form = await journey({ repeat: true, schema: { precision: 2 } })
    const result = await form.post('10,000.50', {}, '/test-grant/amount/00000000-0000-4000-8000-000000000001')

    expect(result.statusCode).toBe(303)
    expect(form.state().items).toEqual([
      expect.objectContaining({ amount: 10000.5, itemId: '00000000-0000-4000-8000-000000000001' })
    ])
  })

  test('does not normalise numeric fields belonging to another page', async () => {
    const form = await journey()
    const result = await form.post('1,000', { otherAmount: '2,000' })

    expect(result.statusCode).toBe(200)
    expect(form.context().errors).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'otherAmount' })]))
    expect(form.context().payload.otherAmount).toBe('2,000')
    expect(form.cacheService.setState).not.toHaveBeenCalled()
  })
})

describe('number input hook scope', () => {
  test.each([
    null,
    { definition: { definition: { pages: [] } } },
    { definition: { definition: { pages: [{ path: '/amount', controller: 'StatusPageController' }] } } }
  ])('leaves the payload intact when there is no matching question page: %j', async (envelope) => {
    const payload = { amount: '1,000' }
    const request = {
      method: 'post',
      route: { realm: { plugin: '@defra/forms-engine-plugin' } },
      params: { path: 'amount' },
      app: { stateWithDefinition: Promise.resolve(envelope) },
      payload
    }
    const h = { continue: Symbol('continue') }

    expect(await normaliseNumberInputs(request, h)).toBe(h.continue)
    expect(payload).toEqual({ amount: '1,000' })
  })

  test.each([
    { method: 'get', payload: { amount: '1,000' } },
    { realm: 'other-plugin', payload: { amount: '1,000' } },
    { path: null, payload: { amount: '1,000' } },
    { payload: null },
    { payload: '1,000' },
    { payload: { amount: 1000 } },
    { payload: { amount: ['1,000', '2,000'] } }
  ])(
    'ignores requests outside its scope: %j',
    async ({ method = 'post', realm = '@defra/forms-engine-plugin', path = 'amount', payload }) => {
      const request = { method, route: { realm: { plugin: realm } }, params: { path }, payload }
      const h = { continue: Symbol('continue') }
      const before = structuredClone(payload)

      expect(await normaliseNumberInputs(request, h)).toBe(h.continue)
      expect(request.payload).toEqual(before)
    }
  )
})
