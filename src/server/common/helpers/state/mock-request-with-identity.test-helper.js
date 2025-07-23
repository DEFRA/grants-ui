import { fn } from 'jest-mock'

export function mockRequestWithIdentity(overrides = {}) {
  return {
    auth: {
      credentials: {
        userId: 'user_test',
        businessId: 'biz_test',
        grantId: 'grant_test',
        ...overrides.credentials
      }
    },
    logger: {
      error: fn(),
      warn: fn(),
      info: fn()
    },
    ...overrides
  }
}
