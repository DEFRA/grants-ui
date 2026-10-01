// @ts-nocheck
import { vi } from 'vitest'
import {
  isNoActionsMockEnabled,
  NO_ACTIONS_MOCK_COOKIE,
  isWindowClosedMockEnabled,
  WINDOW_CLOSED_MOCK_COOKIE
} from './mock-overrides.js'
import { isDevToolsEnabled } from './dev-tools-enabled.js'

vi.mock('./dev-tools-enabled.js', () => ({ isDevToolsEnabled: vi.fn() }))

describe.each([
  { name: 'isNoActionsMockEnabled', isEnabled: isNoActionsMockEnabled, cookie: NO_ACTIONS_MOCK_COOKIE },
  { name: 'isWindowClosedMockEnabled', isEnabled: isWindowClosedMockEnabled, cookie: WINDOW_CLOSED_MOCK_COOKIE }
])('$name', ({ isEnabled, cookie }) => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDevToolsEnabled.mockReturnValue(true)
  })

  it('is true when dev tools are enabled and the cookie is set', () => {
    expect(isEnabled({ state: { [cookie]: '1' } })).toBe(true)
  })

  it('is false when dev tools are disabled, even with the cookie set', () => {
    isDevToolsEnabled.mockReturnValue(false)

    expect(isEnabled({ state: { [cookie]: '1' } })).toBe(false)
  })

  it('is false when the cookie is absent, any other value, or there is no request', () => {
    expect(isEnabled({ state: {} })).toBe(false)
    expect(isEnabled({ state: { [cookie]: '0' } })).toBe(false)
    expect(isEnabled({})).toBe(false)
    expect(isEnabled()).toBe(false)
  })
})
