import { beforeEach, expect, it, vi } from 'vitest'
import { primeApplicationContext } from './prime-application-context.js'
import { tryRoutingDefinition, isUnscopedGrantRoot } from '../helpers/definition/routing-definition.js'
import { getStateWithDefinition } from '../helpers/state/state-with-definition-context.js'

vi.mock('../helpers/definition/routing-definition.js', () => ({
  tryRoutingDefinition: vi.fn(),
  isUnscopedGrantRoot: vi.fn()
}))
vi.mock('../helpers/state/state-with-definition-context.js', () => ({ getStateWithDefinition: vi.fn() }))
const h = { continue: Symbol('continue') }
let request
beforeEach(() => {
  vi.clearAllMocks()
  request = {
    params: { slug: 'example' },
    route: { settings: { app: {} } },
    auth: { isAuthenticated: true, credentials: { contactId: 'test-user' } }
  }
  isUnscopedGrantRoot.mockReturnValue(false)
})
it('leaves definition-only routes to their own controller', async () => {
  request.route.settings.app.definitionOnly = true
  expect(await primeApplicationContext(request, h)).toBe(h.continue)
  expect(tryRoutingDefinition).not.toHaveBeenCalled()
  expect(getStateWithDefinition).not.toHaveBeenCalled()
})
it('skips unauthenticated requests', async () => {
  request.auth.isAuthenticated = false
  await primeApplicationContext(request, h)
  expect(getStateWithDefinition).not.toHaveBeenCalled()
})
it('primes normal application journeys', async () => {
  await primeApplicationContext(request, h)
  expect(getStateWithDefinition).toHaveBeenCalledExactlyOnceWith(request)
  expect(tryRoutingDefinition).not.toHaveBeenCalled()
})
it('keeps multi-application root routing free of application locks', async () => {
  isUnscopedGrantRoot.mockReturnValue(true)
  tryRoutingDefinition.mockResolvedValue({ definition: { allowMultipleApplications: true } })
  await primeApplicationContext(request, h)
  expect(getStateWithDefinition).not.toHaveBeenCalled()
})
it.each([null, { definition: { allowMultipleApplications: false } }])(
  'uses the normal state read for a single-application root or a definition-read fallback',
  async (envelope) => {
    isUnscopedGrantRoot.mockReturnValue(true)
    tryRoutingDefinition.mockResolvedValue(envelope)
    await primeApplicationContext(request, h)
    expect(getStateWithDefinition).toHaveBeenCalledExactlyOnceWith(request)
  }
)
it('defers state-read failures to the later loader', async () => {
  getStateWithDefinition.mockRejectedValue(new Error('Backend unavailable'))
  expect(await primeApplicationContext(request, h)).toBe(h.continue)
})
