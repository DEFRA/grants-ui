import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const UNKNOWN_USER = 'unknown'
const USER_AGENT = 'user-agent'
function logAuthFailure(request, authErrorMessage, hasCredentials) {
  const errorDetails = {
    path: request.path,
    userId: UNKNOWN_USER,
    error: authErrorMessage,
    isAuthenticated: request.auth.isAuthenticated,
    strategy: request.auth?.strategy,
    mode: request.auth?.mode,
    hasCredentials,
    artifacts: request.auth?.artifacts ? 'present' : 'none',
    userAgent: request.headers?.[USER_AGENT] || UNKNOWN_USER,
    referer: request.headers?.referer || 'none',
    queryParams: request.query
  }

  log(LogCodes.AUTH.UNAUTHORIZED_ACCESS, errorDetails, request)

  log(
    LogCodes.AUTH.SIGN_IN_FAILURE,
    {
      userId: UNKNOWN_USER,
      errorMessage: `Authentication failed at OIDC sign-in. Auth state: ${JSON.stringify({
        isAuthenticated: request.auth.isAuthenticated,
        strategy: request.auth?.strategy,
        mode: request.auth?.mode,
        error: authErrorMessage,
        hasCredentials
      })}`,
      step: 'oidc_sign_in_authentication_check',
      failureAnalysis: {
        failureType: hasCredentials ? 'token_exchange_failure' : 'oauth_redirect_failure',
        errorMessage: authErrorMessage,
        hasCredentials,
        likelyIssue: hasCredentials
          ? 'Bell.js completed OAuth redirect but failed during token exchange - check client credentials, redirect URL, and token endpoint connectivity'
          : 'OAuth redirect failed - check authorization endpoint and initial OAuth configuration'
      }
    },
    request
  )
}

function logAuthDebugInfo(request) {
  const authDebugInfo = {
    path: request.path,
    isAuthenticated: request.auth.isAuthenticated,
    strategy: request.auth?.strategy,
    mode: request.auth?.mode,
    hasCredentials: !!request.auth?.credentials,
    hasToken: !!request.auth?.credentials?.token,
    hasProfile: !!request.auth?.credentials?.profile,
    userAgent: request.headers?.[USER_AGENT] || UNKNOWN_USER,
    referer: request.headers?.referer || 'none',
    queryParams: request.query,
    authError: request.auth?.error?.message || 'none',
    cookiesReceived: Object.keys(request.state || {}),
    hasBellCookie: Object.keys(request.state || {}).some((key) => key.includes('bell') || key.includes('defra-id')),
    requestMethod: request.method,
    isSecure: request.server.info.protocol === 'https'
  }

  log(LogCodes.AUTH.AUTH_DEBUG, authDebugInfo, request)
}

function logTokenExchangeFailure(request, hasCredentials) {
  log(
    LogCodes.AUTH.SIGN_IN_FAILURE,
    {
      userId: UNKNOWN_USER,
      errorMessage:
        'Token exchange failure detected - Bell completed OAuth redirect but cannot exchange code for token',
      step: 'token_exchange_failure_analysis',
      troubleshooting: {
        issue: 'Failed obtaining access token',
        checkList: [
          'Verify DEFRA_ID_CLIENT_SECRET is correct',
          'Verify DEFRA_ID_REDIRECT_URL matches registered redirect URI exactly',
          'Check network connectivity to token endpoint from production environment',
          'Verify token endpoint URL in well-known configuration',
          'Check if client credentials are valid in Defra ID system'
        ],
        credentialsPresent: hasCredentials,
        errorPattern: 'hasCredentials=true + "Failed obtaining access token" = token exchange failed',
        nextSteps: 'Check Bell.js token exchange logs and verify client configuration'
      },
      requestContext: {
        query: request.query,
        cookies: Object.keys(request.state || {}),
        hasStateParam: !!request.query.state,
        hasCodeParam: !!request.query.code
      }
    },
    request
  )
}

function logSuccessfulSignIn(profile, role, scope) {
  log(LogCodes.AUTH.SIGN_IN_SUCCESS, {
    userId: profile.contactId,
    organisationId: profile.currentRelationshipId,
    role,
    scope: scope.join(', '),
    sessionId: profile.sessionId
  })
}

export { logAuthFailure, logAuthDebugInfo, logTokenExchangeFailure, logSuccessfulSignIn }
