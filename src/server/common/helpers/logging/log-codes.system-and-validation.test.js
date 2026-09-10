import { LogCodes, validateLogCodes } from './log-codes.js'
import {
  testLogCodes,
  getValidatedLogCode,
  TEST_USER_IDS,
  TEST_PATHS,
  TEST_ERRORS,
  TEST_GRANT_TYPES,
  TEST_SBI,
  TEST_ENDPOINTS,
  TEST_PORTS,
  TEST_METHODS
} from './log-codes.test-helpers.js'

describe('LogCodes', () => {
  describe('SYSTEM log codes', () => {
    testLogCodes('SYSTEM', [
      [
        'SERVER_ERROR',
        'error',
        { errorMessage: TEST_ERRORS.DATABASE_ERROR },
        `Server error occurred: ${TEST_ERRORS.DATABASE_ERROR}`
      ],
      [
        'SERVER_ERROR with upstreamStatus',
        'error',
        { errorMessage: TEST_ERRORS.DATABASE_ERROR, upstreamStatus: 502 },
        `Server error occurred: ${TEST_ERRORS.DATABASE_ERROR} | upstreamStatus=502`
      ],
      [
        'SERVER_ERROR with null upstreamStatus is omitted',
        'error',
        { errorMessage: TEST_ERRORS.DATABASE_ERROR, upstreamStatus: null },
        `Server error occurred: ${TEST_ERRORS.DATABASE_ERROR}`
      ],
      [
        'CLIENT_ERROR',
        'warn',
        { statusCode: 403, method: 'POST', path: '/x', errorMessage: 'Forbidden' },
        'Client error: status=403 POST /x - Forbidden'
      ],
      [
        'SYSTEM_STARTUP',
        'info',
        { port: TEST_PORTS.DEFAULT },
        `System startup completed on port=${TEST_PORTS.DEFAULT}`
      ],
      [
        'EXTERNAL_API_CALL',
        'info',
        { endpoint: TEST_ENDPOINTS.API_GRANTS, userId: TEST_USER_IDS.DEFAULT },
        `External API call to ${TEST_ENDPOINTS.API_GRANTS} for CRN=${TEST_USER_IDS.MASKED}`
      ],
      [
        'EXTERNAL_API_CALL_DEBUG',
        'debug',
        {
          endpoint: TEST_ENDPOINTS.API_GRANTS,
          error: TEST_ERRORS.CONNECTION_FAILED,
          method: TEST_METHODS.GET,
          identity: TEST_USER_IDS.DEFAULT
        },
        `External ${TEST_METHODS.GET} to /api/grants (${TEST_USER_IDS.MASKED})`
      ],
      ['SYSTEM_SHUTDOWN', 'info', {}, 'System shutdown initiated'],
      [
        'EXTERNAL_API_ERROR',
        'error',
        { endpoint: TEST_ENDPOINTS.API_GRANTS, errorMessage: TEST_ERRORS.CONNECTION_FAILED },
        `External API error for ${TEST_ENDPOINTS.API_GRANTS}: ${TEST_ERRORS.CONNECTION_FAILED}`
      ],
      [
        'EXTERNAL_API_ERROR with service and upstreamStatus',
        'error',
        {
          endpoint: TEST_ENDPOINTS.API_GRANTS,
          errorMessage: TEST_ERRORS.CONNECTION_FAILED,
          service: 'grants-ui-backend',
          upstreamStatus: 502
        },
        `External API error for ${TEST_ENDPOINTS.API_GRANTS} | service=grants-ui-backend | upstreamStatus=502: ${TEST_ERRORS.CONNECTION_FAILED}`
      ],
      [
        'EXTERNAL_API_ERROR with attempts after retry exhaustion',
        'error',
        {
          endpoint: TEST_ENDPOINTS.API_GRANTS,
          errorMessage: TEST_ERRORS.CONNECTION_FAILED,
          service: 'grants-ui-backend',
          upstreamStatus: 502,
          attempts: 3
        },
        `External API error for ${TEST_ENDPOINTS.API_GRANTS} | service=grants-ui-backend | upstreamStatus=502 | attempts=3: ${TEST_ERRORS.CONNECTION_FAILED}`
      ],
      [
        'GAS_ACTION_ERROR',
        'error',
        { action: 'submit', grantCode: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH, errorMessage: 'Connection timeout' },
        `Error invoking GAS action submit for grant ${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}: Connection timeout`
      ],
      [
        'VIEW_PATH_CHECK',
        'debug',
        { index: 0, path: '/app/views', exists: true, isAbsolute: true },
        'View path 0: path=/app/views, exists=true, isAbsolute=true'
      ],
      [
        'ENV_CONFIG_DEBUG',
        'debug',
        { configType: 'database', configValues: { host: 'localhost', port: 5432 } },
        'Environment configuration: database - {"host":"localhost","port":5432}'
      ],
      ['STARTUP_PHASE', 'info', { phase: 'plugins', status: 'completed' }, 'Startup phase: plugins - completed'],
      [
        'PLUGIN_REGISTRATION',
        'debug',
        { pluginName: 'auth-plugin', status: 'registered' },
        'Plugin registration: auth-plugin - registered'
      ],
      [
        'BACKEND_AUTH_CONFIG_ERROR',
        'error',
        { missingKeys: ['GRANTS_UI_BACKEND_AUTH_TOKEN', 'GRANTS_UI_BACKEND_ENCRYPTION_KEY'] },
        'Backend auth configuration invalid | missingKeys=GRANTS_UI_BACKEND_AUTH_TOKEN, GRANTS_UI_BACKEND_ENCRYPTION_KEY'
      ],
      [
        'RELATIONSHIP_PARSE_ERROR',
        'error',
        {
          relationships: '1100014934:106284736:Test Organisation:default-organisation-id:relationship:relationshipLoa',
          reason: 'Invalid format: not enough fields'
        },
        'extractFarmDetails: Invalid relationship format | relationships="1100014934:106284736:Test Organisation:default-organisation-id:relationship:relationshipLoa" | reason=Invalid format: not enough fields'
      ],
      [
        'CONFIG_MISSING',
        'error',
        {
          missing: ['agreements.uiUrl', 'agreements.uiToken']
        },
        'Missing required configuration: agreements.uiUrl, agreements.uiToken'
      ],
      [
        'INVALID_REDIRECT_RULES',
        'error',
        {
          reason: 'preSubmission: missing targetUrl',
          formName: 'testFormName'
        },
        'Invalid redirect rules in form "testFormName" | reason=preSubmission: missing targetUrl'
      ],
      [
        'CONSOLIDATED_VIEW_API_ERROR',
        'error',
        {
          sbi: TEST_SBI.DEFAULT,
          errorMessage: 'someErrorMessage'
        },
        `Unexpected error fetching business data from Consolidated View API | sbi=${TEST_SBI.DEFAULT} | status=unknown | error=someErrorMessage`
      ],
      [
        'SESSION_STATE_CLEAR_FAILED',
        'error',
        {
          slug: 'test-form',
          sessionKey: 'testSessionKey',
          errorMessage: 'someErrorMessage'
        },
        `Failed to clear application state for slug=test-form, sessionKey=testSessionKey, error=someErrorMessage`
      ],
      [
        'SESSION_STATE_KEY_PARSE_FAILED',
        'error',
        {
          requestPath: '/test-path',
          errorMessage: 'someErrorMessage'
        },
        `Failed to parse session key: error=someErrorMessage, path=/test-path`
      ],
      [
        'SESSION_STATE_FETCH_FAILED',
        'error',
        {
          requestPath: '/test-path',
          sessionKey: 'testSessionKey',
          errorMessage: 'someErrorMessage'
        },
        `Failed to fetch saved state: sessionKey=testSessionKey, error=someErrorMessage, path=/test-path`
      ],
      [
        'STATE_SIZE_EXCEEDED',
        'warn',
        { size: 102400, limit: 51200, sessionKey: 'test-key' },
        'State payload size 102400 bytes exceeds limit of 51200 bytes for sessionKey=test-key'
      ],
      [
        'VIEW_DEBUG with fallback',
        'debug',
        { currentFilePath: '/app', isRunningBuiltCode: true, basePath: '/app', processWorkingDir: '/app' },
        'View path debug: currentFile=/app, isBuilt=true, basePath=/app, workingDir=/app, pathsResolved=0'
      ],
      [
        'BACKEND_AUTH_CONFIG_ERROR with fallback',
        'error',
        {},
        'Backend auth configuration invalid | missingKeys=unknown'
      ],
      ['CONFIG_MISSING with fallback', 'error', {}, 'Missing required configuration: unknown'],
      [
        'CONSOLIDATED_VIEW_API_ERROR with fallback',
        'error',
        { errorMessage: 'Connection failed' },
        'Unexpected error fetching business data from Consolidated View API | sbi=unknown | status=unknown | error=Connection failed'
      ],
      [
        'CONSOLIDATED_VIEW_API_ERROR with statusCode and responseBody',
        'error',
        {
          sbi: TEST_SBI.DEFAULT,
          statusCode: 503,
          errorMessage: 'Service Unavailable',
          responseBody: '{"error":"upstream"}'
        },
        `Unexpected error fetching business data from Consolidated View API | sbi=${TEST_SBI.DEFAULT} | status=503 | error=Service Unavailable | responseBody={"error":"upstream"}`
      ],
      [
        'GENERIC_ERROR',
        'error',
        { errorMessage: TEST_ERRORS.DATABASE_ERROR },
        `An error occurred: ${TEST_ERRORS.DATABASE_ERROR}`
      ],
      [
        'CONFIG_INVALID',
        'error',
        { key: 'apiUrl', value: 'not-a-url' },
        'Invalid configuration, key "apiUrl" is missing or invalid: not-a-url'
      ],
      [
        'CONSOLIDATED_VIEW_SUCCESS',
        'info',
        { sbi: TEST_SBI.DEFAULT },
        `Consolidated View API request successful | sbi=${TEST_SBI.DEFAULT}`
      ],
      ['CONSOLIDATED_VIEW_SUCCESS with fallback', 'info', {}, 'Consolidated View API request successful | sbi=unknown'],
      [
        'CONSOLIDATED_VIEW_PARTIAL_SUCCESS',
        'info',
        { sbi: TEST_SBI.DEFAULT, failedPaths: 'address,phone', statusCode: 207 },
        `Partial success from Consolidated View API | sbi=${TEST_SBI.DEFAULT} | failedPaths=address,phone | status=207`
      ],
      [
        'CONSOLIDATED_VIEW_PARTIAL_SUCCESS with fallbacks',
        'info',
        { failedPaths: 'address' },
        'Partial success from Consolidated View API | sbi=unknown | failedPaths=address | status=unknown'
      ],
      [
        'CONSOLIDATED_VIEW_ADDRESS_FORMAT structured',
        'info',
        { sbi: TEST_SBI.DEFAULT, uprn: '12345' },
        `Address format for sbi=${TEST_SBI.DEFAULT} is structured, uprn=12345`
      ],
      [
        'CONSOLIDATED_VIEW_ADDRESS_FORMAT unstructured',
        'info',
        { sbi: TEST_SBI.DEFAULT },
        `Address format for sbi=${TEST_SBI.DEFAULT} is unstructured, uprn=not set`
      ],
      [
        'RATE_LIMIT_EXCEEDED',
        'warn',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          ip: '127.0.0.1',
          userId: TEST_USER_IDS.DEFAULT,
          userAgent: 'Mozilla/5.0'
        },
        `Rate limit exceeded: path=${TEST_PATHS.EXAMPLE_GRANT}, ip=127.0.0.1, CRN=${TEST_USER_IDS.MASKED}, userAgent=Mozilla/5.0`
      ],
      [
        'RATE_LIMIT_EXCEEDED with fallbacks',
        'warn',
        { path: TEST_PATHS.EXAMPLE_GRANT },
        `Rate limit exceeded: path=${TEST_PATHS.EXAMPLE_GRANT}, ip=unknown, CRN=unknown, userAgent=unknown`
      ],
      [
        'CHECK_DETAILS_TERMINAL_PAGE_INJECTED',
        'info',
        { grantCode: 'example-grant-with-auth' },
        'ensureUpdateDetailsPage: Check details terminal page for grantCode=example-grant-with-auth injected into model'
      ],
      [
        'CHECK_DETAILS_TERMINAL_PAGE_INJECTED with fallback',
        'info',
        {},
        'ensureUpdateDetailsPage: Check details terminal page for grantCode=unknown injected into model'
      ],
      [
        'PAGES_NOT_INITIALISED',
        'warn',
        { grantCode: 'example-grant-with-auth' },
        'ensureUpdateDetailsPage: model.pages is empty for grantCode=example-grant-with-auth — pages may not have been initialised yet. If the forms engine has changed to async page initialisation, the queueMicrotask timing assumption no longer holds.'
      ],
      [
        'PAGES_NOT_INITIALISED with fallback',
        'warn',
        {},
        'ensureUpdateDetailsPage: model.pages is empty for grantCode=unknown — pages may not have been initialised yet. If the forms engine has changed to async page initialisation, the queueMicrotask timing assumption no longer holds.'
      ]
    ])

    it('should handle EXTERNAL_API_CALL_DEBUG with unknown identity', () => {
      const logCode = getValidatedLogCode('SYSTEM', 'EXTERNAL_API_CALL_DEBUG', 'debug')
      const result = logCode.messageFunc({
        endpoint: TEST_ENDPOINTS.API_GRANTS,
        method: TEST_METHODS.POST
      })
      expect(result).toBe(`External ${TEST_METHODS.POST} to /api/grants (unknown)`)
    })

    it('should have valid VIEW_DEBUG log code', () => {
      const logCode = getValidatedLogCode('SYSTEM', 'VIEW_DEBUG', 'debug')
      const debugOptions = {
        currentFilePath: '/app/src/server/index.js',
        isRunningBuiltCode: true,
        basePath: '/app',
        processWorkingDir: '/app',
        resolvedViewPaths: ['/app/views', '/app/templates']
      }
      const result = logCode.messageFunc(debugOptions)
      expect(result).toContain('View path debug: currentFile=/app/src/server/index.js')
      expect(result).toContain('isBuilt=true')
      expect(result).toContain('pathsResolved=2')
    })
  })

  describe('AUDIT log codes', () => {
    testLogCodes('AUDIT', [
      [
        'EVENT_PUBLISHED',
        'info',
        {
          messageId: 'mid-123',
          entity: 'application',
          action: 'read',
          entityid: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH
        },
        `Audit event published: messageId=mid-123, entity=application, action=read, entityid=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}`
      ],
      [
        'EVENT_PUBLISH_FAILED',
        'error',
        { entityid: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH, errorMessage: TEST_ERRORS.NETWORK_ERROR },
        `Failed to publish audit event for entityid=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}: ${TEST_ERRORS.NETWORK_ERROR}`
      ]
    ])
  })

  describe('validateLogCodes', () => {
    it('should validate all log codes without throwing', () => {
      expect(() => validateLogCodes(LogCodes)).not.toThrow()
    })

    it.each([
      [
        'invalid log code structure',
        {
          TEST: {
            INVALID: {
              level: 'invalid',
              messageFunc: () => 'test'
            }
          }
        }
      ],
      [
        'missing messageFunc',
        {
          TEST: {
            INVALID: {
              level: 'info'
            }
          }
        }
      ],
      [
        'missing level',
        {
          TEST: {
            INVALID: {
              messageFunc: () => 'test'
            }
          }
        }
      ],
      [
        'null values',
        {
          TEST: {
            INVALID: null
          }
        }
      ],
      [
        'invalid nested structure',
        {
          TEST: {
            NESTED: {
              INVALID: 'not an object'
            }
          }
        }
      ],
      [
        'array values',
        {
          TEST: {
            INVALID: ['not', 'an', 'object']
          }
        }
      ],
      [
        'function values',
        {
          TEST: {
            INVALID: () => {
              return 'test'
            }
          }
        }
      ]
    ])('should throw error for %s', (_description, invalidLogCodes) => {
      expect(() => validateLogCodes(invalidLogCodes)).toThrow()
    })

    it('should throw error for nested validation failure', () => {
      const invalidLogCodes = {
        TEST: {
          CATEGORY: {
            INVALID: {
              level: 'info'
            }
          }
        }
      }
      expect(() => validateLogCodes(invalidLogCodes)).toThrow('Invalid log code definition for "INVALID"')
    })
  })

  describe('Startup validation error handling', () => {
    it('should throw wrapped error when log code validation fails at startup', async () => {
      vi.resetModules()

      vi.doMock('./log-code-validator.js', () => ({
        validateLogCode: () => {
          throw new Error('Invalid level')
        }
      }))

      await expect(async () => {
        await import('./log-codes.js')
      }).rejects.toThrow('Log code validation failed')

      vi.doUnmock('./log-code-validator.js')
      vi.resetModules()
    })
  })

  describe('Unknown user handling', () => {
    it.each([
      ['AUTH log codes', LogCodes.AUTH.SIGN_IN_ATTEMPT, {}, 'User sign-in attempt for CRN=unknown'],
      ['FORMS log codes', LogCodes.FORMS.FORM_LOAD, { formName: 'test' }, 'Form loaded: test for CRN=unknown'],
      [
        'SYSTEM log codes',
        LogCodes.SYSTEM.EXTERNAL_API_CALL,
        { endpoint: TEST_ENDPOINTS.API_TEST },
        `External API call to ${TEST_ENDPOINTS.API_TEST} for CRN=unknown`
      ]
    ])('should handle unknown users in %s', (_description, logCode, testParams, expectedMessage) => {
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })
})
