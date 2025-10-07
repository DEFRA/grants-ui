import { vi } from 'vitest'
import { formsAuthCallback } from './forms-engine-plugin-auth-helpers.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { WhitelistServiceFactory } from './services/whitelist.service.js'

vi.mock('~/src/server/common/helpers/logging/log.js')
vi.mock('./services/whitelist.service.js')

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
  CRN: '1104734543',
  CONTACT_ID: '987654321',
  SBI: '105123456'
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
      crn: TEST_IDS.CRN,
      sbi: TEST_IDS.SBI
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
  let mockWhitelistService

  beforeEach(() => {
    vi.clearAllMocks()

    mockWhitelistService = {
      validateGrantAccess: vi.fn().mockReturnValue({
        crnPassesValidation: true,
        sbiPassesValidation: true,
        hasCrnValidation: false,
        hasSbiValidation: false,
        overallAccess: true
      }),
      logWhitelistValidation: vi.fn()
    }

    WhitelistServiceFactory.getService = vi.fn().mockReturnValue(mockWhitelistService)
  })

  it('should return early for auth paths', () => {
    const request = {
      path: TEST_PATHS.AUTH_SIGN_IN
    }

    const result = formsAuthCallback(request, null, null)

    expect(result).toBeUndefined()
    expect(log).not.toHaveBeenCalled()
  })

  it('should require authentication for non-start paths with whitelist config', () => {
    const request = {
      path: TEST_PATHS.FORM_PAGE_1,
      auth: {
        isAuthenticated: false
      },
      url: {
        pathname: TEST_PATHS.FORM_PAGE_1,
        search: ''
      },
      query: {}
    }
    const definition = createDefinition(TEST_ENV_VARS.CRN_WHITELIST)

    expect(() => {
      formsAuthCallback(request, null, definition)
    }).toThrow('Redirect')

    expect(log).toHaveBeenCalledWith(
      LogCodes.AUTH.AUTH_DEBUG,
      expect.objectContaining({
        path: 'formsAuthCallback',
        isAuthenticated: false
      })
    )
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

    const result = formsAuthCallback(request, null, null)

    expect(result).toBeUndefined()
    expect(WhitelistServiceFactory.getService).toHaveBeenCalledWith(null)
    expect(mockWhitelistService.validateGrantAccess).toHaveBeenCalledWith(TEST_IDS.CRN, TEST_IDS.SBI)
    expect(mockWhitelistService.logWhitelistValidation).toHaveBeenCalledWith({
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

    mockWhitelistService.validateGrantAccess.mockReturnValue({
      crnPassesValidation: true,
      sbiPassesValidation: true,
      hasCrnValidation: true,
      hasSbiValidation: false,
      overallAccess: true
    })

    const result = formsAuthCallback(request, null, definition)

    expect(result).toBeUndefined()
    expect(WhitelistServiceFactory.getService).toHaveBeenCalledWith(definition)
    expect(mockWhitelistService.validateGrantAccess).toHaveBeenCalledWith(TEST_IDS.CRN, TEST_IDS.SBI)
  })

  it('should allow authenticated users passing SBI whitelist validation', () => {
    const request = createAuthRequest()
    const definition = createDefinition(null, TEST_ENV_VARS.SBI_WHITELIST)

    mockWhitelistService.validateGrantAccess.mockReturnValue({
      crnPassesValidation: true,
      sbiPassesValidation: true,
      hasCrnValidation: false,
      hasSbiValidation: true,
      overallAccess: true
    })

    const result = formsAuthCallback(request, null, definition)

    expect(result).toBeUndefined()
    expect(mockWhitelistService.validateGrantAccess).toHaveBeenCalledWith(TEST_IDS.CRN, TEST_IDS.SBI)
  })

  it.each([
    [
      'CRN',
      TEST_ENV_VARS.CRN_WHITELIST,
      null,
      {
        crnPassesValidation: false,
        sbiPassesValidation: true,
        hasCrnValidation: true,
        hasSbiValidation: false,
        overallAccess: false
      }
    ],
    [
      'SBI',
      null,
      TEST_ENV_VARS.SBI_WHITELIST,
      {
        crnPassesValidation: true,
        sbiPassesValidation: false,
        hasCrnValidation: false,
        hasSbiValidation: true,
        overallAccess: false
      }
    ]
  ])('should redirect when %s fails whitelist validation', (type, crnEnv, sbiEnv, mockValidationResult) => {
    const request = createAuthRequest()
    const definition = createDefinition(crnEnv, sbiEnv)

    mockWhitelistService.validateGrantAccess.mockReturnValue(mockValidationResult)

    const thrownError = getThrownError(() => formsAuthCallback(request, null, definition))

    expect(thrownError.message).toBe('Unauthorised')
    expect(thrownError.output.statusCode).toBe(statusCodes.redirect)
    expect(thrownError.output.headers.location).toBe('/auth/journey-unauthorised')
    expect(thrownError.isBoom).toBe(true)
  })

  it('should handle both CRN and SBI whitelist validation together', () => {
    const request = createAuthRequest()
    const definition = createDefinition(TEST_ENV_VARS.CRN_WHITELIST, TEST_ENV_VARS.SBI_WHITELIST)

    mockWhitelistService.validateGrantAccess.mockReturnValue({
      crnPassesValidation: true,
      sbiPassesValidation: true,
      hasCrnValidation: true,
      hasSbiValidation: true,
      overallAccess: true
    })

    const result = formsAuthCallback(request, null, definition)

    expect(result).toBeUndefined()
    expect(mockWhitelistService.validateGrantAccess).toHaveBeenCalledWith(TEST_IDS.CRN, TEST_IDS.SBI)
  })

  it('should validate whitelist access for authenticated users on non-start paths', () => {
    const request = createAuthRequest({ path: TEST_PATHS.FORM_PAGE_1 })
    const definition = createDefinition(TEST_ENV_VARS.CRN_WHITELIST, TEST_ENV_VARS.SBI_WHITELIST)

    const result = formsAuthCallback(request, null, definition)

    expect(result).toBeUndefined()
    expect(mockWhitelistService.validateGrantAccess).toHaveBeenCalledWith(TEST_IDS.CRN, TEST_IDS.SBI)
  })

  it('should handle request without query params in auth debug log', () => {
    const request = createUnauthRequest(TEST_PATHS.FORM_START, null)

    expect(() => {
      formsAuthCallback(request, null, null)
    }).toThrow('Redirect')

    expect(log).toHaveBeenCalledWith(
      LogCodes.AUTH.AUTH_DEBUG,
      expect.objectContaining({
        queryParams: {}
      })
    )
  })

  it('should redirect when one of multiple validations fails', () => {
    const request = createAuthRequest()
    const definition = createDefinition(TEST_ENV_VARS.CRN_WHITELIST, TEST_ENV_VARS.SBI_WHITELIST)

    mockWhitelistService.validateGrantAccess.mockReturnValue({
      crnPassesValidation: true,
      sbiPassesValidation: false,
      hasCrnValidation: true,
      hasSbiValidation: true,
      overallAccess: false
    })

    expect(() => {
      formsAuthCallback(request, null, definition)
    }).toThrow('Unauthorised')
  })
})
