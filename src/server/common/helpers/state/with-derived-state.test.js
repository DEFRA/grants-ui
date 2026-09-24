import { withDerivedState } from './with-derived-state.js'
import { catchAll } from '../errors.js'
import { log } from '../logging/log.js'

function fixture(options = {}) {
  class Page extends withDerivedState(class {}, {
    stateKeys: ['total'],
    requiresAcknowledgement: true,
    ...options
  }) {
    path = '/calculation'
    getCalculatedAnswers = vi.fn((_request, state) => ({ total: state.quantity * 2 }))
    setState = vi.fn(async (_request, state) => JSON.parse(JSON.stringify(state)))
  }
  const page = new Page()
  const context = {
    state: { quantity: 10, additionalAnswers: { total: 20, otherResult: 'keep' } },
    relevantPages: [page]
  }
  return { page, context, request: {} }
}

describe('withDerivedState', () => {
  it('compares local calculated answers and detects an edited input', async () => {
    const { page, context, request } = fixture()

    await expect(page.isStateStale(request, context)).resolves.toBe(false)
    context.state.quantity = 12
    await expect(page.isStateStale(request, context)).resolves.toBe(true)
    expect(page.setState).not.toHaveBeenCalled()
  })

  it.each([undefined, {}, { total: undefined }, { otherResult: 'keep' }])(
    'treats missing owned answers as stale: %s',
    async (additionalAnswers) => {
      const { page, context, request } = fixture()
      context.state.additionalAnswers = additionalAnswers
      await expect(page.isStateStale(request, context)).resolves.toBe(true)
    }
  )

  it('recognises a zero result as current', async () => {
    const { page, context, request } = fixture()
    context.state.quantity = 0
    context.state.additionalAnswers.total = 0
    await expect(page.isStateStale(request, context)).resolves.toBe(false)
  })

  it('compares JSON result values structurally, ignoring unrelated answers', async () => {
    const { page, context, request } = fixture()
    context.state.additionalAnswers.total = { amounts: [1, 2] }
    page.getCalculatedAnswers.mockReturnValue({ total: { amounts: [1, 2] } })
    await expect(page.isStateStale(request, context)).resolves.toBe(false)
  })

  it('persists owned results without mutating state or replacing unrelated answers', async () => {
    const { page, context, request } = fixture()
    context.state.quantity = 12
    const before = structuredClone(context.state)

    const saved = await page.refreshState(request, context)

    expect(saved).toEqual({ quantity: 12, additionalAnswers: { total: 24, otherResult: 'keep' } })
    expect(context.state).toEqual(before)
    expect(page.setState).toHaveBeenCalledExactlyOnceWith(request, saved)
  })

  it.each(['excluded', 'preview'])('does no calculation or persistence for an %s page', async (mode) => {
    const { page, context, request } = fixture()
    if (mode === 'excluded') {
      context.relevantPages = []
    } else {
      context.isForceAccess = true
    }

    await expect(page.isStateStale(request, context)).resolves.toBe(false)
    await expect(page.refreshState(request, context)).resolves.toBe(context.state)
    expect(page.getCalculatedAnswers).not.toHaveBeenCalled()
    expect(page.setState).not.toHaveBeenCalled()
  })

  it.each([{ wrongKey: 1 }, { total: 20, unrelated: 42 }, { total: undefined }])(
    'rejects output that violates state ownership: %s',
    async (answers) => {
      const { page, context, request } = fixture()
      page.getCalculatedAnswers.mockResolvedValue(answers)
      await expect(page.refreshState(request, context)).rejects.toThrow('Failed to refresh derived answers')
      expect(page.setState).not.toHaveBeenCalled()
    }
  )

  it.each(['calculate', 'persist'])('preserves a %s failure and the existing state', async (stage) => {
    const { page, context, request } = fixture()
    const cause = new Error('upstream unavailable')
    const before = structuredClone(context.state)
    const operation = stage === 'calculate' ? page.getCalculatedAnswers : page.setState
    operation.mockRejectedValue(cause)

    const error = await page.refreshState(request, context).catch((error) => error)

    expect(error.details.status).toBe(500)
    expect([...error.causeErrors].map((root) => root.message)).toContain(cause.message)
    expect(context.state).toEqual(before)
    if (stage === 'calculate') {
      expect(page.setState).not.toHaveBeenCalled()
    }
  })

  it('lets the global handler log a calculation failure and render the HTTP 500 page', async () => {
    const { page, context, request } = fixture()
    page.getCalculatedAnswers.mockRejectedValue(new Error('API unavailable'))
    log.mockClear()

    const error = await page.refreshState(request, context).catch((error) => error)
    expect(log).not.toHaveBeenCalled()
    const errorRequest = { response: error }
    const h = { view: vi.fn().mockReturnThis(), code: vi.fn().mockReturnThis(), request: { app: {} } }

    catchAll(errorRequest, h)

    expect(log).toHaveBeenCalledWith(
      error.logCode,
      expect.objectContaining({ errorMessage: 'Failed to refresh derived answers' }),
      errorRequest
    )
    expect(h.view).toHaveBeenCalledWith('errors/500', { supportEmail: null })
    expect(h.code).toHaveBeenCalledWith(500)
  })
})
