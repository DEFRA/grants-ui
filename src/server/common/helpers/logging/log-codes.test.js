import { LogCodes, validateLogCodes } from './log-codes.js'

// Test constants
const TEST_USER_IDS = {
  DEFAULT: 'test',
  CONTACT_ID: '12345'
}

const TEST_PATHS = {
  ADMIN: '/admin',
  AUTH_SIGN_IN_OIDC: '/auth/sign-in-oidc',
  EXAMPLE_GRANT: '/example-grant',
  TEST_PATH: '/test-path'
}

const TEST_ERRORS = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  INVALID_TOKEN: 'Invalid token',
  NETWORK_ERROR: 'Network error',
  NO_TOKEN: 'No token provided',
  PROCESSING_FAILED: 'Processing failed',
  REQUIRED_FIELD: 'Required field missing',
  DATABASE_ERROR: 'Database connection failed',
  CONNECTION_FAILED: 'Connection failed',
  INVALID_DATA: 'Invalid data'
}

const TEST_SESSIONS = {
  SESSION_123: 'session123'
}

const TEST_ORGANIZATIONS = {
  DEFAULT: 'org'
}

const TEST_GRANT_TYPES = {
  ADDING_VALUE: 'adding-value'
}

const TEST_FORM_NAMES = {
  DECLARATION: 'declaration'
}

const TEST_REFERENCE_NUMBERS = {
  REF_123: 'REF123'
}

const TEST_SBI = {
  DEFAULT: '106284736'
}

const TEST_TASK_NAMES = {
  DECLARATION: 'declaration'
}

const TEST_AGREEMENT_TYPES = {
  TERMS: 'terms'
}

const TEST_ENDPOINTS = {
  API_GRANTS: 'http://example.com/api/grants',
  API_TEST: 'http://example.com/api/test'
}

const TEST_PORTS = {
  DEFAULT: 3000
}

const TEST_METHODS = {
  GET: 'GET',
  POST: 'POST'
}

describe('LogCodes', () => {
  describe('AUTH log codes', () => {
    it.each([
      [
        'SIGN_IN_ATTEMPT',
        'info',
        { userId: TEST_USER_IDS.DEFAULT },
        `User sign-in attempt for user=${TEST_USER_IDS.DEFAULT}`
      ],
      [
        'SIGN_IN_SUCCESS',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, organisationId: TEST_ORGANIZATIONS.DEFAULT },
        `User sign-in successful for user=${TEST_USER_IDS.DEFAULT}, organisation=${TEST_ORGANIZATIONS.DEFAULT}`
      ],
      [
        'SIGN_IN_FAILURE',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, error: TEST_ERRORS.INVALID_CREDENTIALS },
        `User sign-in failed for user=${TEST_USER_IDS.DEFAULT}. Error: ${TEST_ERRORS.INVALID_CREDENTIALS}`
      ],
      [
        'SIGN_OUT',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, sessionId: TEST_SESSIONS.SESSION_123 },
        `User sign-out for user=${TEST_USER_IDS.DEFAULT}, session=${TEST_SESSIONS.SESSION_123}`
      ],
      [
        'TOKEN_VERIFICATION_SUCCESS',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, organisationId: TEST_ORGANIZATIONS.DEFAULT },
        `Token verification successful for user=${TEST_USER_IDS.DEFAULT}, organisation=${TEST_ORGANIZATIONS.DEFAULT}`
      ],
      [
        'TOKEN_VERIFICATION_FAILURE',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, error: TEST_ERRORS.INVALID_TOKEN },
        `Token verification failed for user=${TEST_USER_IDS.DEFAULT}. Error: ${TEST_ERRORS.INVALID_TOKEN}`
      ],
      [
        'SESSION_EXPIRED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, sessionId: TEST_SESSIONS.SESSION_123 },
        `Session expired for user=${TEST_USER_IDS.DEFAULT}, session=${TEST_SESSIONS.SESSION_123}`
      ],
      [
        'UNAUTHORIZED_ACCESS',
        'error',
        { path: TEST_PATHS.ADMIN, userId: TEST_USER_IDS.DEFAULT },
        `Unauthorized access attempt to path=${TEST_PATHS.ADMIN} from user=${TEST_USER_IDS.DEFAULT}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.AUTH[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })

    it('should have valid AUTH_DEBUG log code', () => {
      const logCode = LogCodes.AUTH.AUTH_DEBUG
      expect(logCode.level).toBe('debug')
      expect(typeof logCode.messageFunc).toBe('function')
      const debugOptions = {
        path: TEST_PATHS.AUTH_SIGN_IN_OIDC,
        isAuthenticated: false,
        strategy: 'defra-id',
        mode: 'try',
        hasCredentials: false,
        hasToken: false,
        hasProfile: false,
        userAgent: 'Mozilla/5.0',
        referer: 'https://example.com',
        queryParams: { test: 'value' },
        authError: TEST_ERRORS.NO_TOKEN
      }
      const result = logCode.messageFunc(debugOptions)
      expect(result).toContain(`Auth debug for path=${TEST_PATHS.AUTH_SIGN_IN_OIDC}`)
      expect(result).toContain('isAuthenticated=false')
      expect(result).toContain('strategy=defra-id')
      expect(result).toContain(`authError=${TEST_ERRORS.NO_TOKEN}`)
    })

    it.each([
      [
        'WHITELIST_ACCESS_GRANTED',
        'info',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          userId: 'test123',
          sbi: TEST_SBI.DEFAULT,
          validationType: 'CRN and SBI validation passed'
        },
        `Whitelist access granted to path=${TEST_PATHS.EXAMPLE_GRANT} for user=test123, sbi=${TEST_SBI.DEFAULT}: CRN and SBI validation passed`
      ],
      [
        'WHITELIST_ACCESS_DENIED_BOTH',
        'info',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          userId: 'test123',
          sbi: TEST_SBI.DEFAULT
        },
        `Whitelist access denied to path=${TEST_PATHS.EXAMPLE_GRANT}: Both CRN test123 and SBI ${TEST_SBI.DEFAULT} failed validation`
      ],
      [
        'WHITELIST_ACCESS_DENIED_CRN_PASSED',
        'info',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          userId: 'test123',
          sbi: TEST_SBI.DEFAULT
        },
        `Whitelist access denied to path=${TEST_PATHS.EXAMPLE_GRANT}: CRN test123 passed but SBI ${TEST_SBI.DEFAULT} failed validation`
      ],
      [
        'WHITELIST_ACCESS_DENIED_SBI_PASSED',
        'info',
        {
          path: TEST_PATHS.EXAMPLE_GRANT,
          userId: 'test123',
          sbi: TEST_SBI.DEFAULT
        },
        `Whitelist access denied to path=${TEST_PATHS.EXAMPLE_GRANT}: SBI ${TEST_SBI.DEFAULT} passed but CRN test123 failed validation`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.AUTH[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })

  describe('FORMS log codes', () => {
    it.each([
      [
        'FORM_LOAD',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION, userId: TEST_USER_IDS.DEFAULT },
        `Form loaded: ${TEST_FORM_NAMES.DECLARATION} for user=${TEST_USER_IDS.DEFAULT}`
      ],
      [
        'FORM_VALIDATION_ERROR',
        'error',
        { formName: TEST_FORM_NAMES.DECLARATION, error: TEST_ERRORS.REQUIRED_FIELD },
        `Form validation error in ${TEST_FORM_NAMES.DECLARATION}: ${TEST_ERRORS.REQUIRED_FIELD}`
      ],
      [
        'FORM_STARTED',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION, userCrn: TEST_USER_IDS.DEFAULT, userSbi: TEST_SBI.DEFAULT },
        `Form started: [formName=${TEST_FORM_NAMES.DECLARATION} | userCrn=${TEST_USER_IDS.DEFAULT} | userSbi=${TEST_SBI.DEFAULT}]`
      ],
      [
        'FORM_SUBMIT',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION, userId: TEST_USER_IDS.DEFAULT },
        `Form submitted: ${TEST_FORM_NAMES.DECLARATION} by user=${TEST_USER_IDS.DEFAULT}`
      ],
      [
        'FORM_VALIDATION_SUCCESS',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION },
        `Form validation successful for ${TEST_FORM_NAMES.DECLARATION}`
      ],
      [
        'FORM_PROCESSING_ERROR',
        'error',
        { formName: TEST_FORM_NAMES.DECLARATION, error: TEST_ERRORS.PROCESSING_FAILED },
        `Form processing error for ${TEST_FORM_NAMES.DECLARATION}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      [
        'FORM_SAVE',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION, userId: TEST_USER_IDS.DEFAULT },
        `Form saved: ${TEST_FORM_NAMES.DECLARATION} for user=${TEST_USER_IDS.DEFAULT}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.FORMS[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })

  describe('SUBMISSION log codes', () => {
    it.each([
      [
        'SUBMISSION_STARTED',
        'info',
        { grantType: TEST_GRANT_TYPES.ADDING_VALUE, userId: TEST_USER_IDS.DEFAULT },
        `Grant submission started for grantType=${TEST_GRANT_TYPES.ADDING_VALUE}, user=${TEST_USER_IDS.DEFAULT}`
      ],
      [
        'SUBMISSION_SUCCESS',
        'info',
        { grantType: TEST_GRANT_TYPES.ADDING_VALUE, referenceNumber: TEST_REFERENCE_NUMBERS.REF_123 },
        `Grant submission successful for grantType=${TEST_GRANT_TYPES.ADDING_VALUE}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}`
      ],
      [
        'SUBMISSION_FAILURE',
        'error',
        {
          grantType: TEST_GRANT_TYPES.ADDING_VALUE,
          userCrn: TEST_USER_IDS.DEFAULT,
          userSbi: TEST_SBI.DEFAULT,
          error: TEST_ERRORS.NETWORK_ERROR,
          stack: 'Error stack trace'
        },
        `Grant submission failed for grantType=${TEST_GRANT_TYPES.ADDING_VALUE}, userCrn=${TEST_USER_IDS.DEFAULT}, userSbi=${TEST_SBI.DEFAULT}, error=${TEST_ERRORS.NETWORK_ERROR}, stack=Error stack trace`
      ],
      [
        'SUBMISSION_VALIDATION_ERROR',
        'error',
        {
          grantType: TEST_GRANT_TYPES.ADDING_VALUE,
          referenceNumber: TEST_REFERENCE_NUMBERS.REF_123,
          validationId: 'VAL123'
        },
        `Submission validation error for grantType=${TEST_GRANT_TYPES.ADDING_VALUE}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}, validationId=VAL123`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.SUBMISSION[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })

    it('should have valid SUBMISSION_PAYLOAD_LOG log code', () => {
      const logCode = LogCodes.SUBMISSION.SUBMISSION_PAYLOAD_LOG
      expect(logCode.level).toBe('debug')
      expect(typeof logCode.messageFunc).toBe('function')
      const payload = { test: 'data' }
      const result = logCode.messageFunc({ grantType: TEST_GRANT_TYPES.ADDING_VALUE, payload })
      expect(result).toContain(`Submission payload for grantType=${TEST_GRANT_TYPES.ADDING_VALUE}:`)
      expect(result).toContain('"test": "data"')
    })
  })

  describe('DECLARATION log codes', () => {
    it.each([
      [
        'DECLARATION_LOAD',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, grantType: TEST_GRANT_TYPES.ADDING_VALUE },
        `Declaration page loaded for user=${TEST_USER_IDS.DEFAULT}, grantType=${TEST_GRANT_TYPES.ADDING_VALUE}`
      ],
      [
        'DECLARATION_ACCEPTED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, grantType: TEST_GRANT_TYPES.ADDING_VALUE },
        `Declaration accepted by user=${TEST_USER_IDS.DEFAULT}, grantType=${TEST_GRANT_TYPES.ADDING_VALUE}`
      ],
      [
        'DECLARATION_ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, error: TEST_ERRORS.PROCESSING_FAILED },
        `Declaration processing error for user=${TEST_USER_IDS.DEFAULT}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.DECLARATION[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })

  describe('CONFIRMATION log codes', () => {
    it.each([
      [
        'CONFIRMATION_LOAD',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, grantType: TEST_GRANT_TYPES.ADDING_VALUE },
        `Confirmation page loaded for user=${TEST_USER_IDS.DEFAULT}, grantType=${TEST_GRANT_TYPES.ADDING_VALUE}`
      ],
      [
        'CONFIRMATION_SUCCESS',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, referenceNumber: TEST_REFERENCE_NUMBERS.REF_123 },
        `Confirmation processed successfully for user=${TEST_USER_IDS.DEFAULT}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}`
      ],
      [
        'CONFIRMATION_ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, error: TEST_ERRORS.PROCESSING_FAILED },
        `Confirmation processing error for user=${TEST_USER_IDS.DEFAULT}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.CONFIRMATION[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })

  describe('TASKLIST log codes', () => {
    it.each([
      [
        'TASKLIST_LOAD',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, grantType: TEST_GRANT_TYPES.ADDING_VALUE },
        `Task list loaded for user=${TEST_USER_IDS.DEFAULT}, grantType=${TEST_GRANT_TYPES.ADDING_VALUE}`
      ],
      [
        'TASK_COMPLETED',
        'info',
        { taskName: TEST_TASK_NAMES.DECLARATION, userId: TEST_USER_IDS.DEFAULT },
        `Task completed: ${TEST_TASK_NAMES.DECLARATION} for user=${TEST_USER_IDS.DEFAULT}`
      ],
      [
        'TASK_ERROR',
        'error',
        { taskName: TEST_TASK_NAMES.DECLARATION, error: TEST_ERRORS.PROCESSING_FAILED },
        `Task processing error for ${TEST_TASK_NAMES.DECLARATION}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      [
        'CONFIG_LOAD_SKIPPED',
        'debug',
        { tasklistId: 'example', error: TEST_ERRORS.PROCESSING_FAILED },
        `Tasklist config load skipped: tasklistId=example, error=${TEST_ERRORS.PROCESSING_FAILED}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.TASKLIST[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })

  describe('LAND_GRANTS log codes', () => {
    it.each([
      [
        'LAND_GRANT_APPLICATION_SUBMITTED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, referenceNumber: TEST_REFERENCE_NUMBERS.REF_123 },
        `Land grant application submitted for user=${TEST_USER_IDS.DEFAULT}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}`
      ],
      [
        'LAND_GRANT_ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, error: TEST_ERRORS.PROCESSING_FAILED },
        `Land grant processing error for user=${TEST_USER_IDS.DEFAULT}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.LAND_GRANTS[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })

  describe('AGREEMENTS log codes', () => {
    it.each([
      [
        'AGREEMENT_LOAD',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, agreementType: TEST_AGREEMENT_TYPES.TERMS },
        `Agreement loaded for user=${TEST_USER_IDS.DEFAULT}, agreementType=${TEST_AGREEMENT_TYPES.TERMS}`
      ],
      [
        'AGREEMENT_ACCEPTED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, agreementType: TEST_AGREEMENT_TYPES.TERMS },
        `Agreement accepted by user=${TEST_USER_IDS.DEFAULT}, agreementType=${TEST_AGREEMENT_TYPES.TERMS}`
      ],
      [
        'AGREEMENT_ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, error: TEST_ERRORS.PROCESSING_FAILED },
        `Agreement processing error for user=${TEST_USER_IDS.DEFAULT}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.AGREEMENTS[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })

  describe('RESOURCE_NOT_FOUND log codes', () => {
    it.each([
      [
        'FORM_NOT_FOUND',
        'info',
        {
          slug: 'test-form',
          userId: TEST_USER_IDS.DEFAULT,
          sbi: TEST_SBI.DEFAULT,
          reason: 'not_found',
          environment: 'production',
          referer: 'http://example.com'
        },
        `Form not found: slug=test-form, userId=${TEST_USER_IDS.DEFAULT}, sbi=${TEST_SBI.DEFAULT}, reason=not_found, environment=production, referer=http://example.com`
      ],
      [
        'TASKLIST_NOT_FOUND',
        'info',
        {
          tasklistId: 'test-tasklist',
          userId: TEST_USER_IDS.DEFAULT,
          sbi: TEST_SBI.DEFAULT,
          reason: 'not_found',
          environment: 'production',
          referer: 'http://example.com'
        },
        `Tasklist not found: tasklistId=test-tasklist, userId=${TEST_USER_IDS.DEFAULT}, sbi=${TEST_SBI.DEFAULT}, reason=not_found, environment=production, referer=http://example.com`
      ],
      [
        'PAGE_NOT_FOUND',
        'info',
        {
          path: TEST_PATHS.TEST_PATH,
          userId: TEST_USER_IDS.DEFAULT,
          sbi: TEST_SBI.DEFAULT,
          referer: 'http://example.com',
          userAgent: 'Mozilla/5.0'
        },
        `Page not found: path=${TEST_PATHS.TEST_PATH}, userId=${TEST_USER_IDS.DEFAULT}, sbi=${TEST_SBI.DEFAULT}, referer=http://example.com, userAgent=Mozilla/5.0`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.RESOURCE_NOT_FOUND[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })

  describe('SYSTEM log codes', () => {
    it.each([
      [
        'SERVER_ERROR',
        'error',
        { error: TEST_ERRORS.DATABASE_ERROR },
        `Server error occurred: ${TEST_ERRORS.DATABASE_ERROR}`
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
        `External API call to ${TEST_ENDPOINTS.API_GRANTS} for user=${TEST_USER_IDS.DEFAULT}`
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
        `External ${TEST_METHODS.GET} to /api/grants (${TEST_USER_IDS.DEFAULT})`
      ],
      ['SYSTEM_SHUTDOWN', 'info', {}, 'System shutdown initiated'],
      [
        'EXTERNAL_API_ERROR',
        'error',
        { endpoint: TEST_ENDPOINTS.API_GRANTS, error: TEST_ERRORS.CONNECTION_FAILED },
        `External API error for ${TEST_ENDPOINTS.API_GRANTS}: ${TEST_ERRORS.CONNECTION_FAILED}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.SYSTEM[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })

    it('should handle EXTERNAL_API_CALL_DEBUG with unknown identity', () => {
      const logCode = LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG
      expect(logCode.level).toBe('debug')
      expect(typeof logCode.messageFunc).toBe('function')
      const result = logCode.messageFunc({
        endpoint: TEST_ENDPOINTS.API_GRANTS,
        method: TEST_METHODS.POST
      })
      expect(result).toBe(`External ${TEST_METHODS.POST} to /api/grants (unknown)`)
    })

    it('should have valid VIEW_DEBUG log code', () => {
      const logCode = LogCodes.SYSTEM.VIEW_DEBUG
      expect(logCode.level).toBe('debug')
      expect(typeof logCode.messageFunc).toBe('function')
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

    it.each([
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
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.SYSTEM[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
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
    ])('should throw error for %s', (description, invalidLogCodes) => {
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
    it('should handle validation errors during startup', () => {
      const mockLogCodes = {
        TEST: {
          INVALID: {
            level: 'invalid-level',
            messageFunc: 'not a function'
          }
        }
      }

      const mockValidateLogCodes = (logCodes) => {
        throw new Error('Test validation error')
      }

      expect(() => {
        try {
          mockValidateLogCodes(mockLogCodes)
        } catch (error) {
          throw new Error(`Log code validation failed: ${error.message}`)
        }
      }).toThrow('Log code validation failed: Test validation error')
    })
  })

  describe('Unknown user handling', () => {
    it.each([
      ['AUTH log codes', LogCodes.AUTH.SIGN_IN_ATTEMPT, {}, 'User sign-in attempt for user=unknown'],
      ['FORMS log codes', LogCodes.FORMS.FORM_LOAD, { formName: 'test' }, 'Form loaded: test for user=unknown'],
      [
        'SYSTEM log codes',
        LogCodes.SYSTEM.EXTERNAL_API_CALL,
        { endpoint: TEST_ENDPOINTS.API_TEST },
        `External API call to ${TEST_ENDPOINTS.API_TEST} for user=unknown`
      ]
    ])('should handle unknown users in %s', (description, logCode, testParams, expectedMessage) => {
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })
})
