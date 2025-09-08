import { vi } from 'vitest'

export function mockRequestWithIdentity(overrides = {}) {
  return {
    auth: {
      credentials: {
        crn: 'user_test',
        relationships: ['rel_test:biz_test:other_test'],
        grantId: 'grant_test',
        ...overrides.credentials
      }
    },
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn()
    },
    ...overrides
  }
}
