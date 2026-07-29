import { maskCrn } from '~/src/server/common/helpers/logging/mask-crn.js'

/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const AUTH = {
  GENERIC_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Authentication error for CRN=${maskCrn(messageOptions.userId)}: ${messageOptions.errorMessage}`
  },
  SIGN_IN_ATTEMPT: {
    level: 'info',
    messageFunc: (messageOptions) => `User sign-in attempt for CRN=${maskCrn(messageOptions.userId)}`
  },
  SIGN_IN_SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `User sign-in successful for CRN=${maskCrn(messageOptions.userId)}, organisation=${messageOptions.organisationId}`
  },
  SIGN_IN_FAILURE: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `User sign-in failed for CRN=${maskCrn(messageOptions.userId)}. Error: ${messageOptions.errorMessage}`
  },
  SIGN_OUT: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `User sign-out for CRN=${maskCrn(messageOptions.userId)}, session=${messageOptions.sessionId}`
  },
  TOKEN_VERIFICATION_SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Token verification successful for CRN=${maskCrn(messageOptions.userId)}, userSBI=${messageOptions.organisationId}`
  },
  TOKEN_VERIFICATION_FAILURE: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Token verification failed for CRN=${maskCrn(messageOptions.userId)}. Error: ${messageOptions.errorMessage}`
  },
  SESSION_EXPIRED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Session expired for CRN=${maskCrn(messageOptions.userId)}, session=${messageOptions.sessionId}`
  },
  UNAUTHORIZED_ACCESS: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Unauthorized access attempt to path=${messageOptions.path} from CRN=${maskCrn(messageOptions.userId)}`
  },
  AUTH_DEBUG: {
    level: 'debug',
    messageFunc: (messageOptions) =>
      `Auth debug for path=${messageOptions.path}: isAuthenticated=${messageOptions.isAuthenticated}, strategy=${messageOptions.strategy}, mode=${messageOptions.mode}, hasCredentials=${messageOptions.hasCredentials}, hasToken=${messageOptions.hasToken}, hasProfile=${messageOptions.hasProfile}, userAgent=${messageOptions.userAgent}, referer=${messageOptions.referer}, queryParams=${JSON.stringify(messageOptions.queryParams)}, authError=${messageOptions.authError}`
  },
  ALLOWLIST_ACCESS_GRANTED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Allowlist access granted to path=${messageOptions.path} for CRN=${maskCrn(messageOptions.userId)}, sbi=${messageOptions.sbi || 'N/A'}, grantCode=${messageOptions.grantCode}`
  },
  ALLOWLIST_ACCESS_DENIED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Allowlist access denied to path=${messageOptions.path} for CRN=${maskCrn(messageOptions.userId)}, sbi=${messageOptions.sbi || 'N/A'}, grantCode=${messageOptions.grantCode}`
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
  },
  OIDC_CONFIG_FETCH_RETRY: {
    level: 'warn',
    messageFunc: (messageOptions) =>
      `OIDC well-known fetch attempt ${messageOptions.attempt}/${messageOptions.maxAttempts} failed for ${messageOptions.wellKnownUrl}: code=${messageOptions.code ?? 'n/a'} message=${messageOptions.errorMessage}`
  },
  OIDC_CONFIG_FETCH_FAILURE: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `OIDC config fetch failed after ${messageOptions.durationMs}ms: code=${messageOptions.code ?? 'n/a'} message=${messageOptions.errorMessage}`
  }
}
