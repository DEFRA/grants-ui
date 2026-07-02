import { vi } from 'vitest'

/**
 * Builds a mock Hapi request carrying auth credentials and a stub logger, for use in tests.
 *
 * @param {{ credentials?: Record<string, unknown> } & Record<string, unknown>} [overrides] - Properties merged into the mock request; `credentials` is merged into `auth.credentials`.
 * @returns {Record<string, unknown>} A mock request object.
 */
export function mockRequestWithIdentity(overrides = {}) {
  return {
    auth: {
      credentials: {
        crn: 'user_test',
        sbi: 'biz_test',
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
