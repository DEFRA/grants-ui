import { fn } from 'jest-mock'

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
      error: fn(),
      warn: fn(),
      info: fn()
    },
    ...overrides
  }
}
