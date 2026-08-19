// @ts-nocheck
import { vi } from 'vitest'
import { isNoActionsMockEnabled, NO_ACTIONS_MOCK_COOKIE } from './mock-overrides.js'
import { isDevToolsEnabled } from '~/src/server/dev-tools/dev-tools-enabled.js'

vi.mock('~/src/server/dev-tools/dev-tools-enabled.js', () => ({ isDevToolsEnabled: vi.fn() }))

describe('isNoActionsMockEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDevToolsEnabled.mockReturnValue(true)
  })

  it('is true when dev tools are enabled and the cookie is set', () => {
    expect(isNoActionsMockEnabled({ state: { [NO_ACTIONS_MOCK_COOKIE]: '1' } })).toBe(true)
  })

  it('is false when dev tools are disabled, even with the cookie set', () => {
    isDevToolsEnabled.mockReturnValue(false)

    expect(isNoActionsMockEnabled({ state: { [NO_ACTIONS_MOCK_COOKIE]: '1' } })).toBe(false)
  })

  it('is false when the cookie is absent, any other value, or there is no request', () => {
    expect(isNoActionsMockEnabled({ state: {} })).toBe(false)
    expect(isNoActionsMockEnabled({ state: { [NO_ACTIONS_MOCK_COOKIE]: '0' } })).toBe(false)
    expect(isNoActionsMockEnabled({})).toBe(false)
    expect(isNoActionsMockEnabled()).toBe(false)
  })
})
