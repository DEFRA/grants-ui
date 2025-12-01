import { vi } from 'vitest'

export const mockLoggerFactory = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
})

export const mockLoggerFactoryWithCustomMethods = (customMethods = {}) => ({
  ...mockLoggerFactory(),
  ...customMethods
})

/**
 * Creates a mock log code with the specified level
 * @param {string} level - The log level ('info', 'error', 'warn', 'debug')
 * @returns {object} Mock log code object
 */
const mockCode = (level) => ({ level, messageFunc: vi.fn() })

/**
 * Complete mock of all LogCodes - mirrors src/server/common/helpers/logging/log-codes.js
 * This should be the single source of truth for LogCodes mocks in tests
 */
export const MockLogCodes = {
  AUTH: {
    SIGN_IN_ATTEMPT: mockCode('info'),
    SIGN_IN_SUCCESS: mockCode('info'),
    SIGN_IN_FAILURE: mockCode('error'),
    SIGN_OUT: mockCode('info'),
    TOKEN_VERIFICATION_SUCCESS: mockCode('info'),
    TOKEN_VERIFICATION_FAILURE: mockCode('error'),
    SESSION_EXPIRED: mockCode('info'),
    UNAUTHORIZED_ACCESS: mockCode('error'),
    AUTH_DEBUG: mockCode('debug'),
    WHITELIST_ACCESS_GRANTED: mockCode('info'),
    WHITELIST_ACCESS_DENIED_BOTH: mockCode('info'),
    WHITELIST_ACCESS_DENIED_CRN_PASSED: mockCode('info'),
    WHITELIST_ACCESS_DENIED_SBI_PASSED: mockCode('info'),
    CREDENTIALS_MISSING: mockCode('error'),
    TOKEN_MISSING: mockCode('error'),
    INVALID_STATE: mockCode('error')
  },
  FORMS: {
    FORM_LOAD: mockCode('info'),
    FORM_SUBMIT: mockCode('info'),
    FORM_VALIDATION_ERROR: mockCode('error'),
    FORM_VALIDATION_SUCCESS: mockCode('info'),
    FORM_PROCESSING_ERROR: mockCode('error'),
    FORM_SAVE: mockCode('info'),
    SLUG_STORED: mockCode('debug'),
    SLUG_RESOLVED: mockCode('debug')
  },
  SUBMISSION: {
    SUBMISSION_SUCCESS: mockCode('info'),
    SUBMISSION_COMPLETED: mockCode('info'),
    SUBMISSION_FAILURE: mockCode('error'),
    SUBMISSION_VALIDATION_ERROR: mockCode('error'),
    SUBMISSION_PAYLOAD_LOG: mockCode('debug'),
    SUBMISSION_REDIRECT_FAILURE: mockCode('error'),
    VALIDATOR_NOT_FOUND: mockCode('error'),
    APPLICATION_STATUS_UPDATED: mockCode('debug'),
    SUBMISSION_PROCESSING: mockCode('debug'),
    SUBMISSION_REDIRECT: mockCode('debug')
  },
  DECLARATION: {
    DECLARATION_LOAD: mockCode('info'),
    DECLARATION_ACCEPTED: mockCode('info'),
    DECLARATION_ERROR: mockCode('error')
  },
  CONFIRMATION: {
    CONFIRMATION_LOAD: mockCode('info'),
    CONFIRMATION_SUCCESS: mockCode('info'),
    CONFIRMATION_ERROR: mockCode('error'),
    SUBMITTED_STATUS_RETRIEVED: mockCode('info')
  },
  TASKLIST: {
    TASKLIST_LOAD: mockCode('info'),
    TASK_COMPLETED: mockCode('info'),
    TASK_ERROR: mockCode('error'),
    CONFIG_LOAD_SKIPPED: mockCode('debug'),
    CACHE_RETRIEVAL_FAILED: mockCode('warn')
  },
  LAND_GRANTS: {
    LAND_GRANT_APPLICATION_STARTED: mockCode('info'),
    LAND_GRANT_APPLICATION_SUBMITTED: mockCode('info'),
    LAND_GRANT_ERROR: mockCode('error'),
    NO_LAND_PARCELS_FOUND: mockCode('warn'),
    NO_ACTIONS_FOUND: mockCode('error'),
    VALIDATE_APPLICATION_ERROR: mockCode('error'),
    FETCH_ACTIONS_ERROR: mockCode('error'),
    UNAUTHORISED_PARCEL: mockCode('error')
  },
  AGREEMENTS: {
    AGREEMENT_LOAD: mockCode('info'),
    AGREEMENT_ACCEPTED: mockCode('info'),
    AGREEMENT_ERROR: mockCode('error'),
    PROXY_RESPONSE_ERROR: mockCode('error')
  },
  COOKIES: {
    PAGE_LOAD: mockCode('info')
  },
  RESOURCE_NOT_FOUND: {
    FORM_NOT_FOUND: mockCode('info'),
    TASKLIST_NOT_FOUND: mockCode('info'),
    PAGE_NOT_FOUND: mockCode('info')
  },
  SYSTEM: {
    VIEW_DEBUG: mockCode('debug'),
    VIEW_PATH_CHECK: mockCode('debug'),
    ENV_CONFIG_DEBUG: mockCode('debug'),
    SERVER_ERROR: mockCode('error'),
    STARTUP_PHASE: mockCode('info'),
    PLUGIN_REGISTRATION: mockCode('debug'),
    SYSTEM_STARTUP: mockCode('info'),
    SYSTEM_SHUTDOWN: mockCode('info'),
    EXTERNAL_API_CALL: mockCode('info'),
    EXTERNAL_API_CALL_DEBUG: mockCode('debug'),
    EXTERNAL_API_ERROR: mockCode('error'),
    GAS_ACTION_ERROR: mockCode('error'),
    BACKEND_AUTH_CONFIG_ERROR: mockCode('error'),
    RELATIONSHIP_PARSE_ERROR: mockCode('error'),
    CONFIG_MISSING: mockCode('error'),
    WHITELIST_CONFIG_INCOMPLETE: mockCode('error'),
    CRN_ENV_VAR_MISSING: mockCode('error'),
    SBI_ENV_VAR_MISSING: mockCode('error'),
    INVALID_REDIRECT_RULES: mockCode('error'),
    CONSOLIDATED_VIEW_API_ERROR: mockCode('error'),
    SESSION_STATE_CLEAR_FAILED: mockCode('error'),
    SESSION_STATE_KEY_PARSE_FAILED: mockCode('error'),
    SESSION_STATE_FETCH_FAILED: mockCode('error')
  }
}

/**
 * Standard mock for the log helper module
 * Usage: vi.mock('~/src/server/common/helpers/logging/log.js', async () => {
 *   const { mockLogHelper } = await import('~/src/__mocks__')
 *   return mockLogHelper()
 * })
 */
export const mockLogHelper = () => ({
  logger: mockLoggerFactory(),
  log: vi.fn(),
  LogCodes: MockLogCodes
})

export const mockLogCodesHelper = () => ({
  LogCodes: MockLogCodes
})

export const mockRequestLogger = () => mockLoggerFactory()
