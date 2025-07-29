import { fn } from 'jest-mock'

export function mockRequestWithIdentity(overrides = {}) {
  return {
    auth: {
      credentials: {
        id: 'user_test',
        relationships: ['relationship123:biz_test'],
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
