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
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.INVALID_CREDENTIALS },
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
        `Token verification successful for userCRN=${TEST_USER_IDS.DEFAULT}, userSBI=${TEST_ORGANIZATIONS.DEFAULT}`
      ],
      [
        'TOKEN_VERIFICATION_FAILURE',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.INVALID_TOKEN },
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
      ],
      [
        'UNAUTHORIZED_ACCESS with missing userId',
        'error',
        { path: TEST_PATHS.ADMIN },
        `Unauthorized access attempt to path=${TEST_PATHS.ADMIN} from user=unknown`
      ],
      [
        'SIGN_IN_FAILURE with missing userId',
        'error',
        { errorMessage: TEST_ERRORS.INVALID_CREDENTIALS },
        `User sign-in failed for user=unknown. Error: ${TEST_ERRORS.INVALID_CREDENTIALS}`
      ],
      [
        'TOKEN_VERIFICATION_FAILURE with missing userId',
        'error',
        { errorMessage: TEST_ERRORS.INVALID_TOKEN },
        `Token verification failed for user=unknown. Error: ${TEST_ERRORS.INVALID_TOKEN}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const actualLogCodeName = logCodeName.split(' ')[0]
      const logCode = LogCodes.AUTH[actualLogCodeName]
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
      ],
      ['CREDENTIALS_MISSING', 'error', {}, `No credentials received from Bell OAuth provider`],
      ['TOKEN_MISSING', 'error', {}, `No token received from Defra Identity`],
      [
        'INVALID_STATE',
        'error',
        { reason: 'someReason', storedStatePresent: true },
        `Invalid OAuth state provided | reason=someReason | storedStatePresent=true`
      ],
      [
        'WHITELIST_ACCESS_GRANTED with fallbacks',
        'info',
        { path: TEST_PATHS.EXAMPLE_GRANT },
        `Whitelist access granted to path=${TEST_PATHS.EXAMPLE_GRANT} for user=unknown, sbi=N/A: validation passed`
      ],
      [
        'WHITELIST_ACCESS_DENIED_BOTH with fallbacks',
        'info',
        { path: TEST_PATHS.EXAMPLE_GRANT },
        `Whitelist access denied to path=${TEST_PATHS.EXAMPLE_GRANT}: Both CRN unknown and SBI unknown failed validation`
      ],
      [
        'WHITELIST_ACCESS_DENIED_CRN_PASSED with fallbacks',
        'info',
        { path: TEST_PATHS.EXAMPLE_GRANT },
        `Whitelist access denied to path=${TEST_PATHS.EXAMPLE_GRANT}: CRN unknown passed but SBI unknown failed validation`
      ],
      [
        'WHITELIST_ACCESS_DENIED_SBI_PASSED with fallbacks',
        'info',
        { path: TEST_PATHS.EXAMPLE_GRANT },
        `Whitelist access denied to path=${TEST_PATHS.EXAMPLE_GRANT}: SBI unknown passed but CRN unknown failed validation`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const actualLogCodeName = logCodeName.split(' ')[0]
      const logCode = LogCodes.AUTH[actualLogCodeName]
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
        { formName: TEST_FORM_NAMES.DECLARATION, errorMessage: TEST_ERRORS.REQUIRED_FIELD },
        `Form validation error in ${TEST_FORM_NAMES.DECLARATION}: ${TEST_ERRORS.REQUIRED_FIELD}`
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
        { formName: TEST_FORM_NAMES.DECLARATION, errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Form processing error for ${TEST_FORM_NAMES.DECLARATION}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      [
        'FORM_SAVE',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION, userId: TEST_USER_IDS.DEFAULT },
        `Form saved: ${TEST_FORM_NAMES.DECLARATION} for user=${TEST_USER_IDS.DEFAULT}`
      ],
      [
        'FORM_SUBMIT with missing userId',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION },
        `Form submitted: ${TEST_FORM_NAMES.DECLARATION} by user=unknown`
      ],
      [
        'FORM_SAVE with missing userId',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION },
        `Form saved: ${TEST_FORM_NAMES.DECLARATION} for user=unknown`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const actualLogCodeName = logCodeName.split(' ')[0]
      const logCode = LogCodes.FORMS[actualLogCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })

  describe('SUBMISSION log codes', () => {
    it.each([
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
          errorMessage: TEST_ERRORS.NETWORK_ERROR,
          stack: 'Error stack trace'
        },
        `Grant submission failed for grantType=${TEST_GRANT_TYPES.ADDING_VALUE}, userCrn=${TEST_USER_IDS.DEFAULT}, userSbi=${TEST_SBI.DEFAULT}, error=${TEST_ERRORS.NETWORK_ERROR}`
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
      ],
      [
        'SUBMISSION_REDIRECT_FAILURE',
        'error',
        {
          grantType: TEST_GRANT_TYPES.ADDING_VALUE,
          referenceNumber: TEST_REFERENCE_NUMBERS.REF_123,
          errorMessage: 'Error message'
        },
        `Submission redirect failure for grantType=${TEST_GRANT_TYPES.ADDING_VALUE}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}. Error: Error message`
      ],
      [
        'VALIDATOR_NOT_FOUND',
        'error',
        {
          grantType: TEST_GRANT_TYPES.ADDING_VALUE
        },
        `No validator found for grantType=${TEST_GRANT_TYPES.ADDING_VALUE}`
      ],
      [
        'SUBMISSION_COMPLETED',
        'info',
        {
          grantType: TEST_GRANT_TYPES.ADDING_VALUE,
          referenceNumber: TEST_REFERENCE_NUMBERS.REF_123,
          numberOfFields: 5,
          status: 'success'
        },
        `Form submission completed for grantType=${TEST_GRANT_TYPES.ADDING_VALUE}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}, fields=5, status=success`
      ],
      [
        'SUBMISSION_COMPLETED with missing numberOfFields',
        'info',
        {
          grantType: TEST_GRANT_TYPES.ADDING_VALUE,
          referenceNumber: TEST_REFERENCE_NUMBERS.REF_123,
          status: 'success'
        },
        `Form submission completed for grantType=${TEST_GRANT_TYPES.ADDING_VALUE}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}, fields=0, status=success`
      ],
      [
        'APPLICATION_STATUS_UPDATED',
        'debug',
        { controller: 'DeclarationController', status: 'SUBMITTED' },
        'DeclarationController: Application status updated to SUBMITTED'
      ],
      [
        'SUBMISSION_PROCESSING',
        'debug',
        { controller: 'DeclarationController', path: '/declaration' },
        'DeclarationController: Processing form submission, path=/declaration'
      ],
      [
        'SUBMISSION_REDIRECT',
        'debug',
        { controller: 'DeclarationController', redirectPath: '/confirmation' },
        'DeclarationController: Redirecting to /confirmation'
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const actualLogCodeName = logCodeName.split(' ')[0]
      const logCode = LogCodes.SUBMISSION[actualLogCodeName]
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
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.PROCESSING_FAILED },
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
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Confirmation processing error for user=${TEST_USER_IDS.DEFAULT}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      [
        'SUBMITTED_STATUS_RETRIEVED',
        'info',
        { controller: 'ConfirmationController', referenceNumber: TEST_REFERENCE_NUMBERS.REF_123 },
        `ConfirmationController: Retrieved submitted status for referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}`
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
        { taskName: TEST_TASK_NAMES.DECLARATION, errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Task processing error for ${TEST_TASK_NAMES.DECLARATION}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      [
        'CONFIG_LOAD_SKIPPED',
        'debug',
        { tasklistId: 'example', errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Tasklist config load skipped: tasklistId=example, error=${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      [
        'CACHE_RETRIEVAL_FAILED',
        'warn',
        { sessionId: TEST_SESSIONS.SESSION_123, errorMessage: 'Redis timeout' },
        `Cache retrieval failed for sessionId=${TEST_SESSIONS.SESSION_123}, using empty data. Error: Redis timeout`
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
        'LAND_GRANT_APPLICATION_STARTED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT },
        `Land grant application started for user=${TEST_USER_IDS.DEFAULT}`
      ],
      [
        'LAND_GRANT_APPLICATION_SUBMITTED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, referenceNumber: TEST_REFERENCE_NUMBERS.REF_123 },
        `Land grant application submitted for user=${TEST_USER_IDS.DEFAULT}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}`
      ],
      [
        'LAND_GRANT_ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Land grant processing error for user=${TEST_USER_IDS.DEFAULT}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      ['NO_LAND_PARCELS_FOUND', 'warn', { sbi: TEST_SBI.DEFAULT }, `No land parcels found for sbi=${TEST_SBI.DEFAULT}`],
      [
        'NO_ACTIONS_FOUND',
        'error',
        { parcelId: 'testParcelId', sheetId: 'testSheetId' },
        `No actions found | parcelId: testParcelId | sheetId: testSheetId`
      ],
      [
        'VALIDATE_APPLICATION_ERROR',
        'error',
        { errorMessage: 'testErrorMessage', parcelId: 'testParcelId', sheetId: 'testSheetId' },
        `Error validating application: testErrorMessage | parcelId: testParcelId | sheetId: testSheetId`
      ],
      [
        'FETCH_ACTIONS_ERROR',
        'error',
        { errorMessage: 'testErrorMessage', sbi: TEST_SBI.DEFAULT, parcelId: 'testParcelId', sheetId: 'testSheetId' },
        `Error fetching actions: testErrorMessage | sbi: ${TEST_SBI.DEFAULT} | parcelId: testParcelId | sheetId: testSheetId`
      ],
      [
        'UNAUTHORISED_PARCEL',
        'error',
        {
          errorMessage: 'testErrorMessage',
          sbi: TEST_SBI.DEFAULT,
          selectedLandParcel: 'A1-123',
          landParcelsForSbi: ['A1-111', 'A1-222']
        },
        `Land parcel doesn't belong to sbi=${TEST_SBI.DEFAULT} | selectedLandParcel: A1-123 | landParcelsForSbi=["A1-111","A1-222"]`
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
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Agreement processing error for user=${TEST_USER_IDS.DEFAULT}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.AGREEMENTS[logCodeName]
      expect(logCode.level).toBe(expectedLevel)
      expect(typeof logCode.messageFunc).toBe('function')
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })

  describe('COOKIES log codes', () => {
    it.each([
      [
        'PAGE_LOAD',
        'info',
        { returnUrl: '/dashboard', referer: 'http://example.com' },
        'Cookies page loaded: returnUrl=/dashboard, referer=http://example.com'
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const logCode = LogCodes.COOKIES[logCodeName]
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
      ],
      [
        'FORM_NOT_FOUND with fallbacks',
        'info',
        { slug: 'test-form' },
        'Form not found: slug=test-form, userId=anonymous, sbi=unknown, reason=not_found, environment=unknown, referer=none'
      ],
      [
        'TASKLIST_NOT_FOUND with fallbacks',
        'info',
        { tasklistId: 'test-tasklist' },
        'Tasklist not found: tasklistId=test-tasklist, userId=anonymous, sbi=unknown, reason=not_found, environment=unknown, referer=none'
      ],
      [
        'PAGE_NOT_FOUND with fallbacks',
        'info',
        { path: TEST_PATHS.TEST_PATH },
        `Page not found: path=${TEST_PATHS.TEST_PATH}, userId=anonymous, sbi=unknown, referer=none, userAgent=unknown`
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const actualLogCodeName = logCodeName.split(' ')[0]
      const logCode = LogCodes.RESOURCE_NOT_FOUND[actualLogCodeName]
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
        { errorMessage: TEST_ERRORS.DATABASE_ERROR },
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
        { endpoint: TEST_ENDPOINTS.API_GRANTS, errorMessage: TEST_ERRORS.CONNECTION_FAILED },
        `External API error for ${TEST_ENDPOINTS.API_GRANTS}: ${TEST_ERRORS.CONNECTION_FAILED}`
      ],
      [
        'GAS_ACTION_ERROR',
        'error',
        { action: 'submit', grantCode: TEST_GRANT_TYPES.ADDING_VALUE, errorMessage: 'Connection timeout' },
        `Error invoking GAS action submit for grant ${TEST_GRANT_TYPES.ADDING_VALUE}: Connection timeout`
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
        'WHITELIST_CONFIG_INCOMPLETE',
        'error',
        {
          formName: 'testFormName',
          presentVar: 'whitelistSbiEnvVar',
          missingVar: 'whitelistCrnEnvVar'
        },
        'Incomplete whitelist configuration in form "testFormName" | present=whitelistSbiEnvVar | missing=whitelistCrnEnvVar'
      ],
      [
        'CRN_ENV_VAR_MISSING',
        'error',
        {
          envVar: 'whitelistCrnEnvVar',
          formName: 'testFormName'
        },
        'CRN whitelist environment variable "whitelistCrnEnvVar" missing for form "testFormName"'
      ],
      [
        'SBI_ENV_VAR_MISSING',
        'error',
        {
          envVar: 'whitelistSBIEnvVar',
          formName: 'testFormName'
        },
        'SBI whitelist environment variable "whitelistSBIEnvVar" missing for form "testFormName"'
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
        `Unexpected error fetching business data from Consolidated View API | sbi=${TEST_SBI.DEFAULT} | error=someErrorMessage`
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
        'Unexpected error fetching business data from Consolidated View API | sbi=unknown | error=Connection failed'
      ]
    ])('should have valid %s log code', (logCodeName, expectedLevel, testParams, expectedMessage) => {
      const actualLogCodeName = logCodeName.split(' ')[0]
      const logCode = LogCodes.SYSTEM[actualLogCodeName]
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

      // Mock the validator to throw an error
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
      ['AUTH log codes', LogCodes.AUTH.SIGN_IN_ATTEMPT, {}, 'User sign-in attempt for user=unknown'],
      ['FORMS log codes', LogCodes.FORMS.FORM_LOAD, { formName: 'test' }, 'Form loaded: test for user=unknown'],
      [
        'SYSTEM log codes',
        LogCodes.SYSTEM.EXTERNAL_API_CALL,
        { endpoint: TEST_ENDPOINTS.API_TEST },
        `External API call to ${TEST_ENDPOINTS.API_TEST} for user=unknown`
      ]
    ])('should handle unknown users in %s', (_description, logCode, testParams, expectedMessage) => {
      expect(logCode.messageFunc(testParams)).toBe(expectedMessage)
    })
  })
})
