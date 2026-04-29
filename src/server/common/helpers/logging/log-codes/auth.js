/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const AUTH = {
  GENERIC_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Authentication error for user=${messageOptions.userId}: ${messageOptions.errorMessage}`
  },
  SIGN_IN_ATTEMPT: {
    level: 'info',
    messageFunc: (messageOptions) => `User sign-in attempt for user=${messageOptions.userId || 'unknown'}`
  },
  SIGN_IN_SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `User sign-in successful for user=${messageOptions.userId}, organisation=${messageOptions.organisationId}`
  },
  SIGN_IN_FAILURE: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `User sign-in failed for user=${messageOptions.userId || 'unknown'}. Error: ${messageOptions.errorMessage}`
  },
  SIGN_OUT: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `User sign-out for user=${messageOptions.userId}, session=${messageOptions.sessionId}`
  },
  TOKEN_VERIFICATION_SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Token verification successful for userCRN=${messageOptions.userId}, userSBI=${messageOptions.organisationId}`
  },
  TOKEN_VERIFICATION_FAILURE: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Token verification failed for user=${messageOptions.userId || 'unknown'}. Error: ${messageOptions.errorMessage}`
  },
  SESSION_EXPIRED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Session expired for user=${messageOptions.userId}, session=${messageOptions.sessionId}`
  },
  UNAUTHORIZED_ACCESS: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Unauthorized access attempt to path=${messageOptions.path} from user=${messageOptions.userId || 'unknown'}`
  },
  AUTH_DEBUG: {
    level: 'debug',
    messageFunc: (messageOptions) =>
      `Auth debug for path=${messageOptions.path}: isAuthenticated=${messageOptions.isAuthenticated}, strategy=${messageOptions.strategy}, mode=${messageOptions.mode}, hasCredentials=${messageOptions.hasCredentials}, hasToken=${messageOptions.hasToken}, hasProfile=${messageOptions.hasProfile}, userAgent=${messageOptions.userAgent}, referer=${messageOptions.referer}, queryParams=${JSON.stringify(messageOptions.queryParams)}, authError=${messageOptions.authError}`
  },
  WHITELIST_ACCESS_GRANTED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Whitelist access granted to path=${messageOptions.path} for user=${messageOptions.userId || 'unknown'}, sbi=${messageOptions.sbi || 'N/A'}: ${messageOptions.validationType || 'validation passed'}`
  },
  WHITELIST_ACCESS_DENIED_BOTH: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Whitelist access denied to path=${messageOptions.path}: Both CRN ${messageOptions.userId || 'unknown'} and SBI ${messageOptions.sbi || 'unknown'} failed validation`
  },
  WHITELIST_ACCESS_DENIED_CRN_PASSED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Whitelist access denied to path=${messageOptions.path}: CRN ${messageOptions.userId || 'unknown'} passed but SBI ${messageOptions.sbi || 'unknown'} failed validation`
  },
  WHITELIST_ACCESS_DENIED_SBI_PASSED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Whitelist access denied to path=${messageOptions.path}: SBI ${messageOptions.sbi || 'unknown'} passed but CRN ${messageOptions.userId || 'unknown'} failed validation`
  },
  CREDENTIALS_MISSING: {
    level: 'error',
    messageFunc: () => 'No credentials received from Bell OAuth provider'
  },
  TOKEN_MISSING: {
    level: 'error',
    messageFunc: () => 'No token received from Defra Identity'
  },
  INVALID_STATE: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Invalid OAuth state provided | reason=${messageOptions.reason} | storedStatePresent=${messageOptions.storedStatePresent}`
  }
}
