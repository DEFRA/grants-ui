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
  describe('configured calculation inputs', () => {
    it('reads input paths from the form definition', () => {
      const Page = withDerivedState(class {})
      const page = new Page(
        {
          def: {
            metadata: {
              pageConfig: {
                '/result': {
                  derivedState: {
                    stateKeys: ['result'],
                    calculationInputs: ['county'],
                    requiresAcknowledgement: true
                  }
                }
              }
            }
          }
        },
        { path: '/result' }
      )
      expect(page.derivedState.calculationInputs).toEqual(['county'])
      expect(Object.isFrozen(page.derivedState.calculationInputs)).toBe(true)
    })

    it('migrates missing snapshots and skips both calculation and writes when fresh', async () => {
      const { page, context, request } = fixture({ calculationInputs: ['quantity'] })
      await expect(page.isStateStale(request, context)).resolves.toBe(true)
      expect(page.getCalculatedAnswers).not.toHaveBeenCalled()
      const before = structuredClone(context.state)
      const saved = await page.refreshState(request, context)
      expect(context.state).toEqual(before)
      expect(saved.additionalAnswers).toEqual(before.additionalAnswers)
      context.state = JSON.parse(JSON.stringify(saved))
      await expect(page.isStateStale(request, context)).resolves.toBe(false)
      await expect(page.refreshState(request, context)).resolves.toBe(context.state)
      expect(page.getCalculatedAnswers).toHaveBeenCalledTimes(1)
      expect(page.setState).toHaveBeenCalledTimes(1)
    })

    it('tracks nested configured inputs while ignoring unrelated state', async () => {
      const { page, context, request } = fixture({ calculationInputs: ['quantity', 'additionalAnswers.otherResult'] })
      context.state = await page.refreshState(request, context)
      context.state.unrelated = 'changed'
      await expect(page.isStateStale(request, context)).resolves.toBe(false)
      context.state.additionalAnswers.otherResult = 'changed'
      await expect(page.isStateStale(request, context)).resolves.toBe(true)
      expect(page.getCalculatedAnswers).toHaveBeenCalledTimes(1)
    })

    it('keeps missing inputs stable across persistence and distinguishes null', async () => {
      const { page, context, request } = fixture({ calculationInputs: ['optional'] })
      context.state = await page.refreshState(request, context)
      await expect(page.isStateStale(request, context)).resolves.toBe(false)
      context.state.optional = null
      await expect(page.isStateStale(request, context)).resolves.toBe(true)
    })

    it('treats missing results as stale even when inputs match', async () => {
      const { page, context, request } = fixture({ calculationInputs: ['quantity'] })
      context.state = await page.refreshState(request, context)
      delete context.state.additionalAnswers.total
      await expect(page.isStateStale(request, context)).resolves.toBe(true)
    })

    it('preserves other page snapshots and invalidates changed input configuration', async () => {
      const { page, context, request } = fixture({ calculationInputs: ['quantity'] })
      context.state.derivedStateSnapshots = { '/other': { inputs: [] } }
      context.state = await page.refreshState(request, context)
      expect(context.state.derivedStateSnapshots['/other']).toEqual({ inputs: [] })
      const { page: updatedPage } = fixture({ calculationInputs: ['quantity', 'newInput'] })
      await expect(updatedPage.isStateStale(request, context)).resolves.toBe(true)
      expect(updatedPage.getCalculatedAnswers).not.toHaveBeenCalled()
    })

    it.each(['calculate', 'persist'])('keeps stale results and inputs intact on %s failure', async (stage) => {
      const { page, context, request } = fixture({ calculationInputs: ['quantity'] })
      context.state = await page.refreshState(request, context)
      context.state.quantity = 12
      const before = structuredClone(context.state)
      const operation = stage === 'calculate' ? page.getCalculatedAnswers : page.setState
      operation.mockRejectedValueOnce(new Error('Unavailable'))
      await expect(page.refreshState(request, context)).rejects.toThrow('Failed to refresh derived answers')
      expect(context.state).toEqual(before)
      await expect(page.isStateStale(request, context)).resolves.toBe(true)
    })

    it.each([[], null, 'quantity', ['quantity', 'quantity'], [''], ['a..b'], ['__proto__.x'], ['x.constructor']])(
      'rejects invalid calculationInputs: %j',
      (calculationInputs) => {
        expect(() => fixture({ calculationInputs })).toThrow('Invalid derived-state calculationInputs')
      }
    )
  })

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
