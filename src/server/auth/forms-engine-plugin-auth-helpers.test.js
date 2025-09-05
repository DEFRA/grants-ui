import { formsAuthCallback } from '~/src/server/auth/forms-engine-plugin-auth-helpers.js'
import { mockAuthRequest } from '~/src/__mocks__/hapi-mocks.js'

const getThrownError = (fn) => {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('No error thrown')
}

describe('formsAuthCallback', () => {
  it('should throw a redirect error with 302 when not authenticated', () => {
    const request = mockAuthRequest({
      auth: { isAuthenticated: false },
      url: { pathname: '/test_path', search: '?foo=bar' }
    })

    const thrownError = getThrownError(() => formsAuthCallback(request))

    expect(thrownError).toBeInstanceOf(Error)
    expect(thrownError.message).toBe('Redirect')
    expect(thrownError.isBoom).toBe(true)
    expect(thrownError.output).toBeDefined()
    expect(thrownError.output.statusCode).toBe(302)
    expect(thrownError.output.headers.location).toBe(
      `/auth/sign-in?redirect=${encodeURIComponent('/test_path?foo=bar')}`
    )
  })

  it('should do nothing when authenticated', () => {
    const request = mockAuthRequest({
      auth: { isAuthenticated: true },
      url: { pathname: '/another_path', search: '' }
    })

    expect(() => formsAuthCallback(request)).not.toThrow()
  })
})
