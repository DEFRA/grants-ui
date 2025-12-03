import { mockRequestWithIdentity } from './mock-request-with-identity.test-helper.js'

describe('mockRequestWithIdentity', () => {
  it('returns default credentials and callable logger mocks when no overrides provided', () => {
    const request = mockRequestWithIdentity()

    expect(request.auth.credentials).toEqual({
      crn: 'user_test',
      organisationId: 'biz_test',
      grantId: 'grant_test'
    })

    request.logger.error('test')
    request.logger.warn('test')
    request.logger.info('test')

    expect(request.logger.error).toHaveBeenCalledWith('test')
    expect(request.logger.warn).toHaveBeenCalledWith('test')
    expect(request.logger.info).toHaveBeenCalledWith('test')
  })

  it.each([
    [
      'crn',
      { credentials: { crn: 'custom_user' } },
      { crn: 'custom_user', organisationId: 'biz_test', grantId: 'grant_test' }
    ],
    [
      'multiple credentials',
      { credentials: { crn: 'x', organisationId: 'y' } },
      { crn: 'x', organisationId: 'y', grantId: 'grant_test' }
    ],
    [
      'new credential property',
      { credentials: { extra: 'value' } },
      { crn: 'user_test', organisationId: 'biz_test', grantId: 'grant_test', extra: 'value' }
    ]
  ])('merges %s override into credentials', (_name, overrides, expectedCredentials) => {
    const request = mockRequestWithIdentity(overrides)
    expect(request.auth.credentials).toEqual(expectedCredentials)
  })

  it.each([
    ['params', { params: { slug: 'test' } }, 'params', { slug: 'test' }],
    ['auth', { auth: { custom: true } }, 'auth', { custom: true }],
    ['logger', { logger: { custom: true } }, 'logger', { custom: true }]
  ])('applies top-level %s override', (_name, overrides, key, expected) => {
    const request = mockRequestWithIdentity(overrides)
    expect(request[key]).toEqual(expected)
  })
})
