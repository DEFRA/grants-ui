import {
  testLogCodes,
  getValidatedLogCode,
  TEST_USER_IDS,
  TEST_PATHS,
  TEST_ERRORS,
  TEST_SESSIONS,
  TEST_ORGANIZATIONS,
  TEST_GRANT_TYPES,
  TEST_FORM_NAMES,
  TEST_REFERENCE_NUMBERS,
  TEST_SBI
} from './log-codes.test-helpers.js'

describe('LogCodes', () => {
  describe('AUTH log codes', () => {
    testLogCodes('AUTH', [
      [
        'SIGN_IN_ATTEMPT',
        'info',
        { userId: TEST_USER_IDS.DEFAULT },
        `User sign-in attempt for CRN=${TEST_USER_IDS.MASKED}`
      ],
      [
        'SIGN_IN_SUCCESS',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, organisationId: TEST_ORGANIZATIONS.DEFAULT },
        `User sign-in successful for CRN=${TEST_USER_IDS.MASKED}, organisation=${TEST_ORGANIZATIONS.DEFAULT}`
      ],
      [
        'SIGN_IN_FAILURE',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.INVALID_CREDENTIALS },
        `User sign-in failed for CRN=${TEST_USER_IDS.MASKED}. Error: ${TEST_ERRORS.INVALID_CREDENTIALS}`
      ],
      [
        'SIGN_OUT',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, sessionId: TEST_SESSIONS.SESSION_123 },
        `User sign-out for CRN=${TEST_USER_IDS.MASKED}, session=${TEST_SESSIONS.SESSION_123}`
      ],
      [
        'TOKEN_VERIFICATION_SUCCESS',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, organisationId: TEST_ORGANIZATIONS.DEFAULT },
        `Token verification successful for CRN=${TEST_USER_IDS.MASKED}, userSBI=${TEST_ORGANIZATIONS.DEFAULT}`
      ],
      [
        'TOKEN_VERIFICATION_FAILURE',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.INVALID_TOKEN },
        `Token verification failed for CRN=${TEST_USER_IDS.MASKED}. Error: ${TEST_ERRORS.INVALID_TOKEN}`
      ],
      [
        'SESSION_EXPIRED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, sessionId: TEST_SESSIONS.SESSION_123 },
        `Session expired for CRN=${TEST_USER_IDS.MASKED}, session=${TEST_SESSIONS.SESSION_123}`
      ],
      [
        'UNAUTHORIZED_ACCESS',
        'error',
        { path: TEST_PATHS.ADMIN, userId: TEST_USER_IDS.DEFAULT },
        `Unauthorized access attempt to path=${TEST_PATHS.ADMIN} from CRN=${TEST_USER_IDS.MASKED}`
      ],
      [
        'UNAUTHORIZED_ACCESS with missing userId',
        'error',
        { path: TEST_PATHS.ADMIN },
        `Unauthorized access attempt to path=${TEST_PATHS.ADMIN} from CRN=unknown`
      ],
      [
        'SIGN_IN_FAILURE with missing userId',
        'error',
        { errorMessage: TEST_ERRORS.INVALID_CREDENTIALS },
        `User sign-in failed for CRN=unknown. Error: ${TEST_ERRORS.INVALID_CREDENTIALS}`
      ],
      [
        'TOKEN_VERIFICATION_FAILURE with missing userId',
        'error',
        { errorMessage: TEST_ERRORS.INVALID_TOKEN },
        `Token verification failed for CRN=unknown. Error: ${TEST_ERRORS.INVALID_TOKEN}`
      ],
      [
        'GENERIC_ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.INVALID_CREDENTIALS },
        `Authentication error for CRN=${TEST_USER_IDS.MASKED}: ${TEST_ERRORS.INVALID_CREDENTIALS}`
      ],
      [
        'OIDC_CONFIG_FETCH_RETRY',
        'warn',
        {
          attempt: 1,
          maxAttempts: 3,
          wellKnownUrl: 'https://example.com/.well-known/openid_configuration',
          code: 'ECONNRESET',
          errorMessage: 'Transient blip'
        },
        'OIDC well-known fetch attempt 1/3 failed for https://example.com/.well-known/openid_configuration: code=ECONNRESET message=Transient blip'
      ],
      [
        'OIDC_CONFIG_FETCH_RETRY with missing code',
        'warn',
        {
          attempt: 2,
          maxAttempts: 3,
          wellKnownUrl: 'https://example.com/.well-known/openid_configuration',
          errorMessage: 'Transient blip'
        },
        'OIDC well-known fetch attempt 2/3 failed for https://example.com/.well-known/openid_configuration: code=n/a message=Transient blip'
      ],
      [
        'OIDC_CONFIG_FETCH_FAILURE',
        'error',
        { durationMs: 1234, code: 'ETIMEDOUT', errorMessage: 'Network timeout' },
        'OIDC config fetch failed after 1234ms: code=ETIMEDOUT message=Network timeout'
      ],
      [
        'OIDC_CONFIG_FETCH_FAILURE with missing code',
        'error',
        { durationMs: 1234, errorMessage: 'Network timeout' },
        'OIDC config fetch failed after 1234ms: code=n/a message=Network timeout'
      ]
    ])

    it('should have valid AUTH_DEBUG log code', () => {
      const logCode = getValidatedLogCode('AUTH', 'AUTH_DEBUG', 'debug')
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

    testLogCodes('AUTH', [
      [
        'ALLOWLIST_ACCESS_GRANTED',
        'info',
        { path: TEST_PATHS.EXAMPLE_GRANT, userId: TEST_USER_IDS.DEFAULT, sbi: TEST_SBI.DEFAULT, grantCode: 'woodland' },
        `Allowlist access granted to path=${TEST_PATHS.EXAMPLE_GRANT} for CRN=${TEST_USER_IDS.MASKED}, sbi=${TEST_SBI.DEFAULT}, grantCode=woodland`
      ],
      [
        'ALLOWLIST_ACCESS_DENIED',
        'info',
        { path: TEST_PATHS.EXAMPLE_GRANT, userId: TEST_USER_IDS.DEFAULT, sbi: TEST_SBI.DEFAULT, grantCode: 'woodland' },
        `Allowlist access denied to path=${TEST_PATHS.EXAMPLE_GRANT} for CRN=${TEST_USER_IDS.MASKED}, sbi=${TEST_SBI.DEFAULT}, grantCode=woodland`
      ],
      [
        'ALLOWLIST_ACCESS_GRANTED with fallbacks',
        'info',
        { path: TEST_PATHS.EXAMPLE_GRANT, grantCode: 'woodland' },
        `Allowlist access granted to path=${TEST_PATHS.EXAMPLE_GRANT} for CRN=unknown, sbi=N/A, grantCode=woodland`
      ],
      [
        'ALLOWLIST_ACCESS_DENIED with fallbacks',
        'info',
        { path: TEST_PATHS.EXAMPLE_GRANT, grantCode: 'woodland' },
        `Allowlist access denied to path=${TEST_PATHS.EXAMPLE_GRANT} for CRN=unknown, sbi=N/A, grantCode=woodland`
      ],
      ['CREDENTIALS_MISSING', 'error', {}, `No credentials received from Bell OAuth provider`],
      ['TOKEN_MISSING', 'error', {}, `No token received from Defra Identity`],
      [
        'INVALID_STATE',
        'error',
        { reason: 'someReason', storedStatePresent: true },
        `Invalid OAuth state provided | reason=someReason | storedStatePresent=true`
      ]
    ])
  })

  describe('FORMS log codes', () => {
    testLogCodes('FORMS', [
      [
        'FORM_LOAD',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION, userId: TEST_USER_IDS.DEFAULT },
        `Form loaded: ${TEST_FORM_NAMES.DECLARATION} for CRN=${TEST_USER_IDS.MASKED}`
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
        `Form submitted: ${TEST_FORM_NAMES.DECLARATION} by CRN=${TEST_USER_IDS.MASKED}`
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
        `Form saved: ${TEST_FORM_NAMES.DECLARATION} for CRN=${TEST_USER_IDS.MASKED}`
      ],
      [
        'FORM_SUBMIT with missing userId',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION },
        `Form submitted: ${TEST_FORM_NAMES.DECLARATION} by CRN=unknown`
      ],
      [
        'FORM_SAVE with missing userId',
        'info',
        { formName: TEST_FORM_NAMES.DECLARATION },
        `Form saved: ${TEST_FORM_NAMES.DECLARATION} for CRN=unknown`
      ],
      [
        'SLUG_STORED',
        'debug',
        { controller: 'DeclarationController', slug: 'example-grant' },
        'DeclarationController: Storing slug in context: example-grant'
      ],
      [
        'SLUG_RESOLVED',
        'debug',
        { controller: 'DeclarationController', message: 'Resolved slug from context' },
        'DeclarationController: Resolved slug from context'
      ]
    ])
  })

  describe('SUBMISSION log codes', () => {
    testLogCodes('SUBMISSION', [
      [
        'SUBMISSION_SUCCESS',
        'info',
        { grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH, referenceNumber: TEST_REFERENCE_NUMBERS.REF_123 },
        `Grant submission successful for grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}`
      ],
      [
        'SUBMISSION_FAILURE',
        'error',
        {
          grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          userCrn: TEST_USER_IDS.DEFAULT,
          userSbi: TEST_SBI.DEFAULT,
          errorMessage: TEST_ERRORS.NETWORK_ERROR,
          stack: 'Error stack trace'
        },
        `Grant submission failed for grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}, CRN=${TEST_USER_IDS.MASKED}, userSbi=${TEST_SBI.DEFAULT}, error=${TEST_ERRORS.NETWORK_ERROR}`
      ],
      [
        'SUBMISSION_VALIDATION_ERROR',
        'error',
        {
          grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          referenceNumber: TEST_REFERENCE_NUMBERS.REF_123,
          validationId: 'VAL123'
        },
        `Submission validation error for grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}, validationId=VAL123`
      ],
      [
        'SUBMISSION_REDIRECT_FAILURE',
        'error',
        {
          grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          referenceNumber: TEST_REFERENCE_NUMBERS.REF_123,
          errorMessage: 'Error message'
        },
        `Submission redirect failure for grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}. Error: Error message`
      ],
      [
        'VALIDATOR_NOT_FOUND',
        'error',
        {
          grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH
        },
        `No validator found for grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}`
      ],
      [
        'SUBMISSION_COMPLETED',
        'info',
        {
          grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          referenceNumber: TEST_REFERENCE_NUMBERS.REF_123,
          numberOfFields: 5,
          status: 'success'
        },
        `Form submission completed for grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}, fields=5, status=success`
      ],
      [
        'SUBMISSION_COMPLETED with missing numberOfFields',
        'info',
        {
          grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH,
          referenceNumber: TEST_REFERENCE_NUMBERS.REF_123,
          status: 'success'
        },
        `Form submission completed for grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}, fields=0, status=success`
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
    ])

    it('should have valid SUBMISSION_PAYLOAD_LOG log code', () => {
      const logCode = getValidatedLogCode('SUBMISSION', 'SUBMISSION_PAYLOAD_LOG', 'debug')
      const payload = { test: 'data' }
      const result = logCode.messageFunc({ grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH, payload })
      expect(result).toContain(`Submission payload for grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}:`)
      expect(result).toContain('"test": "data"')
    })
  })

  describe('DECLARATION log codes', () => {
    testLogCodes('DECLARATION', [
      [
        'DECLARATION_LOAD',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH },
        `Declaration page loaded for CRN=${TEST_USER_IDS.MASKED}, grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}`
      ],
      [
        'DECLARATION_ACCEPTED',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH },
        `Declaration accepted by CRN=${TEST_USER_IDS.MASKED}, grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}`
      ],
      [
        'DECLARATION_ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Declaration processing error for CRN=${TEST_USER_IDS.MASKED}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ]
    ])
  })

  describe('CONFIRMATION log codes', () => {
    testLogCodes('CONFIRMATION', [
      [
        'CONFIRMATION_LOAD',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, grantType: TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH },
        `Confirmation page loaded for CRN=${TEST_USER_IDS.MASKED}, grantType=${TEST_GRANT_TYPES.EXAMPLE_GRANT_WITH_AUTH}`
      ],
      [
        'CONFIRMATION_SUCCESS',
        'info',
        { userId: TEST_USER_IDS.DEFAULT, referenceNumber: TEST_REFERENCE_NUMBERS.REF_123 },
        `Confirmation processed successfully for CRN=${TEST_USER_IDS.MASKED}, referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}`
      ],
      [
        'CONFIRMATION_ERROR',
        'error',
        { userId: TEST_USER_IDS.DEFAULT, errorMessage: TEST_ERRORS.PROCESSING_FAILED },
        `Confirmation processing error for CRN=${TEST_USER_IDS.MASKED}: ${TEST_ERRORS.PROCESSING_FAILED}`
      ],
      [
        'SUBMITTED_STATUS_RETRIEVED',
        'info',
        { controller: 'ConfirmationController', referenceNumber: TEST_REFERENCE_NUMBERS.REF_123 },
        `ConfirmationController: Retrieved submitted status for referenceNumber=${TEST_REFERENCE_NUMBERS.REF_123}`
      ]
    ])
  })
})
