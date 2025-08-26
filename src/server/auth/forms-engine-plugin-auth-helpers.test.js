import { formsAuthCallback } from './forms-engine-plugin-auth-helpers.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { whitelistService } from './services/whitelist.service.js'
import { sbiStore } from '~/src/server/sbi/state.js'

jest.mock('~/src/server/common/helpers/logging/log.js')
jest.mock('./services/whitelist.service.js')
jest.mock('~/src/server/sbi/state.js', () => ({
  sbiStore: {
    get: jest.fn()
  }
}))

const getThrownError = (fn) => {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('No error thrown')
}

const TEST_PATHS = {
  AUTH_SIGN_IN: '/auth/sign-in',
  FORM_START: '/form/start',
  FORM_PAGE_1: '/form/page-1',
  TEST_PATH: '/test_path',
  ANOTHER_PATH: '/another_path'
}

const TEST_IDS = {
  CRN: '123456789',
  CONTACT_ID: '987654321',
  SBI: 'SBI123'
}

const TEST_ENV_VARS = {
  CRN_WHITELIST: 'TEST_CRN_WHITELIST',
  SBI_WHITELIST: 'TEST_SBI_WHITELIST'
}

const TEST_QUERY_PARAMS = {
  PARAM_VALUE: { param: 'value' },
  FOO_BAR: { foo: 'bar' }
}

const createAuthRequest = (overrides = {}) => ({
  path: TEST_PATHS.FORM_START,
  auth: {
    isAuthenticated: true,
    credentials: {
      crn: TEST_IDS.CRN
    }
  },
  ...overrides
})

const createUnauthRequest = (path = TEST_PATHS.FORM_START, queryParams = TEST_QUERY_PARAMS.PARAM_VALUE) => ({
  path,
  url: {
    pathname: path,
    search: queryParams ? `?${new URLSearchParams(queryParams).toString()}` : ''
  },
  auth: {
    isAuthenticated: false,
    strategy: 'oauth',
    mode: 'required',
    credentials: null
  },
  query: queryParams
})

const createDefinition = (crnEnvVar = null, sbiEnvVar = null) => ({
  metadata: {
    ...(crnEnvVar && { whitelistCrnEnvVar: crnEnvVar }),
    ...(sbiEnvVar && { whitelistSbiEnvVar: sbiEnvVar })
  }
})

describe('formsAuthCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    sbiStore.get.mockReturnValue(null)
  })

  it('should return early for auth paths', () => {
    const request = {
      path: TEST_PATHS.AUTH_SIGN_IN
    }

    const result = formsAuthCallback(request, null, null)

    expect(result).toBeUndefined()
    expect(log).not.toHaveBeenCalled()
  })

  it('should return early for non-start paths with whitelist config', () => {
    const request = {
      path: TEST_PATHS.FORM_PAGE_1
    }
    const definition = createDefinition(TEST_ENV_VARS.CRN_WHITELIST)

    const result = formsAuthCallback(request, null, definition)

    expect(result).toBeUndefined()
    expect(log).not.toHaveBeenCalled()
  })

  it('should redirect unauthenticated users to sign-in', () => {
    const request = createUnauthRequest()

    expect(() => {
      formsAuthCallback(request, null, null)
    }).toThrow('Redirect')

    expect(log).toHaveBeenCalledWith(LogCodes.AUTH.AUTH_DEBUG, {
      path: 'formsAuthCallback',
      isAuthenticated: false,
      strategy: 'oauth',
      mode: 'required',
      hasCredentials: false,
      hasToken: false,
      hasProfile: false,
      userAgent: 'server',
      referer: 'none',
      queryParams: TEST_QUERY_PARAMS.PARAM_VALUE
    })
  })

  it('should throw a redirect error with 302 when not authenticated', () => {
    const request = createUnauthRequest(TEST_PATHS.TEST_PATH, TEST_QUERY_PARAMS.FOO_BAR)

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

  it('should allow authenticated users with no whitelist validation', () => {
    const request = createAuthRequest()

    sbiStore.get.mockReturnValue(TEST_IDS.SBI)
    whitelistService.logWhitelistValidation.mockImplementation(() => undefined)

    const result = formsAuthCallback(request, null, null)

    expect(result).toBeUndefined()
    expect(whitelistService.logWhitelistValidation).toHaveBeenCalledWith({
      crn: TEST_IDS.CRN,
      sbi: TEST_IDS.SBI,
      path: TEST_PATHS.FORM_START,
      crnPassesValidation: true,
      sbiPassesValidation: true,
      hasCrnValidation: false,
      hasSbiValidation: false
    })
  })

  it('should allow authenticated users passing CRN whitelist validation', () => {
    const request = createAuthRequest()
    const definition = createDefinition(TEST_ENV_VARS.CRN_WHITELIST)

    whitelistService.isCrnWhitelisted.mockReturnValue(true)
    whitelistService.logWhitelistValidation.mockImplementation(() => undefined)

    const result = formsAuthCallback(request, null, definition)

    expect(result).toBeUndefined()
    expect(whitelistService.isCrnWhitelisted).toHaveBeenCalledWith(TEST_IDS.CRN, TEST_ENV_VARS.CRN_WHITELIST)
  })

  it('should allow authenticated users passing SBI whitelist validation', () => {
    const request = createAuthRequest()
    const definition = createDefinition(null, TEST_ENV_VARS.SBI_WHITELIST)

    sbiStore.get.mockReturnValue(TEST_IDS.SBI)
    whitelistService.isSbiWhitelisted.mockReturnValue(true)
    whitelistService.logWhitelistValidation.mockImplementation(() => undefined)

    const result = formsAuthCallback(request, null, definition)

    expect(result).toBeUndefined()
    expect(whitelistService.isSbiWhitelisted).toHaveBeenCalledWith(TEST_IDS.SBI, TEST_ENV_VARS.SBI_WHITELIST)
  })

  it.each([
    ['CRN', TEST_ENV_VARS.CRN_WHITELIST, null, 'isCrnWhitelisted', null],
    ['SBI', null, TEST_ENV_VARS.SBI_WHITELIST, 'isSbiWhitelisted', TEST_IDS.SBI]
  ])('should redirect when %s fails whitelist validation', (type, crnEnv, sbiEnv, mockMethod, sbiValue) => {
    const request = createAuthRequest()
    const definition = createDefinition(crnEnv, sbiEnv)

    if (sbiValue) {
      sbiStore.get.mockReturnValue(sbiValue)
    }
    whitelistService[mockMethod].mockReturnValue(false)
    whitelistService.logWhitelistValidation.mockImplementation(() => undefined)

    const thrownError = getThrownError(() => formsAuthCallback(request, null, definition))

    expect(thrownError.message).toBe('Unauthorised')
    expect(thrownError.output.statusCode).toBe(statusCodes.redirect)
    expect(thrownError.output.headers.location).toBe('/auth/journey-unauthorised')
    expect(thrownError.isBoom).toBe(true)
  })

  it('should use contactId as fallback when crn is not available', () => {
    const request = createAuthRequest({
      auth: {
        isAuthenticated: true,
        credentials: {
          contactId: TEST_IDS.CONTACT_ID
        }
      }
    })

    whitelistService.logWhitelistValidation.mockImplementation(() => undefined)

    formsAuthCallback(request, null, null)

    expect(whitelistService.logWhitelistValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        crn: TEST_IDS.CONTACT_ID
      })
    )
  })

  it('should handle both CRN and SBI whitelist validation together', () => {
    const request = createAuthRequest()
    const definition = createDefinition(TEST_ENV_VARS.CRN_WHITELIST, TEST_ENV_VARS.SBI_WHITELIST)

    sbiStore.get.mockReturnValue(TEST_IDS.SBI)
    whitelistService.isCrnWhitelisted.mockReturnValue(true)
    whitelistService.isSbiWhitelisted.mockReturnValue(true)
    whitelistService.logWhitelistValidation.mockImplementation(() => undefined)

    const result = formsAuthCallback(request, null, definition)

    expect(result).toBeUndefined()
    expect(whitelistService.isCrnWhitelisted).toHaveBeenCalledWith(TEST_IDS.CRN, TEST_ENV_VARS.CRN_WHITELIST)
    expect(whitelistService.isSbiWhitelisted).toHaveBeenCalledWith(TEST_IDS.SBI, TEST_ENV_VARS.SBI_WHITELIST)
  })

  it('should redirect when one of multiple validations fails', () => {
    const request = createAuthRequest()
    const definition = createDefinition(TEST_ENV_VARS.CRN_WHITELIST, TEST_ENV_VARS.SBI_WHITELIST)

    sbiStore.get.mockReturnValue(TEST_IDS.SBI)
    whitelistService.isCrnWhitelisted.mockReturnValue(true)
    whitelistService.isSbiWhitelisted.mockReturnValue(false)
    whitelistService.logWhitelistValidation.mockImplementation(() => undefined)

    expect(() => {
      formsAuthCallback(request, null, definition)
    }).toThrow('Unauthorised')
  })
})
