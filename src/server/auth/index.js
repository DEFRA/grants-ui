import { getPermissions } from '~/src/server/auth/get-permissions.js'
import { getSafeRedirect } from '~/src/server/auth/get-safe-redirect.js'
import { validateState } from '~/src/server/auth/state.js'
import { verifyToken } from '~/src/server/auth/verify-token.js'
import { getSignOutUrl } from './get-sign-out-url.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { config } from '~/src/config/config.js'

const UNKNOWN_USER = 'unknown'
const USER_AGENT = 'user-agent'
const HTTP_FOUND = 302

function handleAuthSignIn(request, h) {
  try {
    // If there's an auth error, log it specifically
    if (request.auth?.error) {
      log(
        LogCodes.AUTH.SIGN_IN_FAILURE,
        {
          userId: UNKNOWN_USER,
          error: `Authentication error at /auth/sign-in: ${request.auth.error.message}`,
          step: 'auth_sign_in_route_error',
          authState: {
            isAuthenticated: request.auth.isAuthenticated,
            strategy: request.auth.strategy,
            mode: request.auth.mode
          }
        },
        request
      )
    }

    // Log that we're about to redirect
    log(
      LogCodes.AUTH.AUTH_DEBUG,
      {
        path: request.path,
        isAuthenticated: 'redirecting',
        strategy: 'auth_sign_in',
        mode: 'redirect_to_home',
        hasCredentials: false,
        hasToken: false,
        hasProfile: false,
        userAgent: request.headers?.[USER_AGENT] || UNKNOWN_USER,
        referer: request.headers?.referer || 'none',
        queryParams: request.query || {},
        authError: 'none',
        redirectTarget: '/home'
      },
      request
    )

    return h.redirect('/home')
  } catch (error) {
    // Log any errors that occur during the redirect
    log(
      LogCodes.AUTH.SIGN_IN_FAILURE,
      {
        userId: UNKNOWN_USER,
        error: `Error during /auth/sign-in redirect: ${error.message}`,
        step: 'auth_sign_in_redirect_error',
        errorStack: error.stack,
        authState: {
          isAuthenticated: request.auth?.isAuthenticated,
          strategy: request.auth?.strategy,
          mode: request.auth?.mode
        }
      },
      request
    )

    // Instead of throwing the error, redirect to an error page or home page
    // This prevents the 500 error from being shown to the user
    return h.redirect('/home').code(HTTP_FOUND)
  }
}

function setupBellOAuthErrorHandling(server) {
  // Add error handling specifically for Bell/OAuth errors
  server.ext('onPreResponse', (request, h) => {
    if (request.path.startsWith('/auth/') && request.response.isBoom) {
      const error = request.response

      // Log detailed Bell/OAuth errors
      log(
        LogCodes.AUTH.SIGN_IN_FAILURE,
        {
          userId: UNKNOWN_USER,
          error: `Bell/OAuth error at ${request.path}: ${String(error.message)}`,
          step: 'bell_oauth_error',
          errorDetails: {
            statusCode: error.output?.statusCode,
            payload: error.output?.payload,
            headers: error.output?.headers,
            data: error.data,
            stack: error.stack
          }
        },
        request
      )

      // For token exchange failures, provide more user-friendly error
      if (error.message.includes('Failed obtaining') || error.message.includes('token')) {
        log(
          LogCodes.AUTH.SIGN_IN_FAILURE,
          {
            userId: UNKNOWN_USER,
            error: 'OAuth2 token exchange failed - possible configuration issue',
            step: 'oauth_token_exchange_failure',
            troubleshooting: {
              checkRedirectUrl: 'Verify DEFRA_ID_REDIRECT_URL matches registration',
              checkClientCredentials: 'Verify DEFRA_ID_CLIENT_ID and DEFRA_ID_CLIENT_SECRET',
              checkNetworkAccess: 'Ensure production can reach token endpoint',
              checkWellKnownUrl: 'Verify DEFRA_ID_WELL_KNOWN_URL is accessible'
            }
          },
          request
        )
      }
    }

    return h.continue
  })
}

function setupAuthRoutes(server) {
  // Only register defra-id related routes if the feature flag is enabled
  if (config.get('defraId.enabled')) {
    server.route({
      method: 'GET',
      path: '/auth/sign-in',
      options: {
        auth: { strategy: 'defra-id', mode: 'try' }
      },
      handler: handleAuthSignIn
    })

    server.route({
      method: ['GET'],
      path: '/auth/sign-in-oidc',
      options: {
        auth: { strategy: 'defra-id', mode: 'try' }
      },
      handler: handleOidcSignIn
    })

    server.route({
      method: 'GET',
      path: '/auth/sign-out',
      handler: handleSignOut
    })

    server.route({
      method: 'GET',
      path: '/auth/sign-out-oidc',
      handler: handleOidcSignOut
    })

    server.route({
      method: 'GET',
      path: '/auth/organisation',
      options: {
        auth: 'defra-id'
      },
      handler: handleOrganisationRedirect
    })
  }

  server.route({
    method: 'GET',
    path: '/auth/journey-unauthorised',
    handler: handleJourneyUnauthorised
  })
}

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const auth = {
  plugin: {
    name: 'auth-router',
    register(server) {
      setupAuthRoutes(server)
      // Only setup Bell/OAuth error handling if defra-id is enabled
      if (config.get('defraId.enabled')) {
        setupBellOAuthErrorHandling(server)
      }
    }
  }
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

function handleUnauthenticatedRequest(request, h) {
  const authErrorMessage = request.auth?.error?.message || 'Not authenticated'
  const hasCredentials = !!request.auth?.credentials

  logAuthFailure(request, authErrorMessage, hasCredentials)

  if (hasCredentials && authErrorMessage?.includes('access token')) {
    logTokenExchangeFailure(request, hasCredentials)
  }

  return renderUnauthorisedView(request, h)
}

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
      error: `Authentication failed at OIDC sign-in. Auth state: ${JSON.stringify({
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

function logTokenExchangeFailure(request, hasCredentials) {
  log(
    LogCodes.AUTH.SIGN_IN_FAILURE,
    {
      userId: UNKNOWN_USER,
      error: 'Token exchange failure detected - Bell completed OAuth redirect but cannot exchange code for token',
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

function renderUnauthorisedView(request, h) {
  log(
    LogCodes.AUTH.AUTH_DEBUG,
    {
      path: request.path,
      isAuthenticated: false,
      strategy: 'system',
      mode: 'view_render_attempt',
      hasCredentials: false,
      hasToken: false,
      hasProfile: false,
      userAgent: 'server',
      referer: 'none',
      queryParams: {},
      authError: 'Attempting to render unauthorised view',
      viewAttempt: 'unauthorised.njk',
      serverWorkingDir: process.cwd(),
      timestamp: new Date().toISOString()
    },
    request
  )

  try {
    const result = h.view('unauthorised')
    log(
      LogCodes.AUTH.AUTH_DEBUG,
      {
        path: request.path,
        isAuthenticated: false,
        strategy: 'system',
        mode: 'view_render_success',
        hasCredentials: false,
        hasToken: false,
        hasProfile: false,
        userAgent: 'server',
        referer: 'none',
        queryParams: {},
        authError: 'Successfully rendered unauthorised view',
        timestamp: new Date().toISOString()
      },
      request
    )
    return result
  } catch (viewError) {
    log(
      LogCodes.AUTH.SIGN_IN_FAILURE,
      {
        userId: UNKNOWN_USER,
        error: `Failed to render unauthorised view: ${viewError.message}`,
        step: 'view_render_error',
        errorStack: viewError.stack,
        viewError: 'unauthorised.njk',
        serverWorkingDir: process.cwd()
      },
      request
    )
    throw viewError
  }
}

async function processAuthenticatedSignIn(request, h) {
  const { profile, token, refreshToken } = request.auth.credentials

  validateProfileData(profile)

  log(
    LogCodes.AUTH.SIGN_IN_ATTEMPT,
    {
      userId: profile.contactId,
      organisationId: profile.currentRelationshipId,
      profileData: JSON.stringify({
        hasToken: !!token,
        hasRefreshToken: !!refreshToken,
        hasProfile: !!profile,
        profileKeys: Object.keys(profile || {}),
        tokenLength: token ? token.length : 0
      })
    },
    request
  )

  await verifyToken(token)

  const { role, scope } = getPermissionsOrDefaults(profile, token)
  await storeSessionData(request, profile, role, scope, token, refreshToken)
  setCookieAuth(request, profile)

  logSuccessfulSignIn(profile, role, scope)

  return redirectAfterSignIn(request, h, profile)
}

function validateProfileData(profile) {
  if (!profile?.sessionId) {
    log(LogCodes.AUTH.SIGN_IN_FAILURE, {
      userId: profile?.contactId || UNKNOWN_USER,
      error: 'Missing required profile data or sessionId',
      step: 'profile_validation',
      profileData: {
        hasProfile: !!profile,
        hasSessionId: !!profile?.sessionId,
        profileKeys: Object.keys(profile || {})
      }
    })
    throw new Error('Authentication failed: Missing required profile data')
  }
}

function getPermissionsOrDefaults(profile, token) {
  try {
    const permissions = getPermissions(profile.crn, profile.organisationId, token)
    return { role: permissions.role, scope: permissions.scope }
  } catch (permissionsError) {
    log(LogCodes.AUTH.SIGN_IN_FAILURE, {
      userId: profile.contactId,
      error: `Failed to get permissions: ${permissionsError.message}`,
      step: 'get_permissions_error',
      profileData: {
        crn: profile.crn,
        organisationId: profile.organisationId,
        hasToken: !!token
      }
    })
    return { role: 'user', scope: ['user'] }
  }
}

async function storeSessionData(request, profile, role, scope, token, refreshToken) {
  try {
    await request.server.app.cache.set(profile.sessionId, {
      isAuthenticated: true,
      ...profile,
      role,
      scope,
      token,
      refreshToken
    })
  } catch (cacheError) {
    log(
      LogCodes.AUTH.SIGN_IN_FAILURE,
      {
        userId: profile.contactId,
        error: `Failed to store session in cache: ${cacheError.message}`,
        step: 'cache_set_error',
        sessionId: profile.sessionId
      },
      request
    )
    throw cacheError
  }
}

function setCookieAuth(request, profile) {
  try {
    request.cookieAuth.set({ sessionId: profile.sessionId })
  } catch (cookieError) {
    log(
      LogCodes.AUTH.SIGN_IN_FAILURE,
      {
        userId: profile.contactId,
        error: `Failed to set cookie auth: ${cookieError.message}`,
        step: 'cookie_auth_set_error',
        sessionId: profile.sessionId
      },
      request
    )
    throw cookieError
  }
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

function redirectAfterSignIn(request, h, profile) {
  try {
    const redirect = request.yar.get('redirect') ?? '/home'
    request.yar.clear('redirect')
    const safeRedirect = getSafeRedirect(redirect)
    return h.redirect(safeRedirect)
  } catch (redirectError) {
    log(
      LogCodes.AUTH.SIGN_IN_FAILURE,
      {
        userId: profile.contactId,
        error: `Failed to redirect after sign in: ${redirectError.message}`,
        step: 'redirect_error',
        sessionId: profile.sessionId
      },
      request
    )
    throw redirectError
  }
}

async function handleOidcSignIn(request, h) {
  try {
    logAuthDebugInfo(request)

    if (!request.auth.isAuthenticated) {
      return handleUnauthenticatedRequest(request, h)
    }

    return await processAuthenticatedSignIn(request, h)
  } catch (error) {
    log(
      LogCodes.AUTH.SIGN_IN_FAILURE,
      {
        userId: UNKNOWN_USER,
        error: `Unexpected error in handleOidcSignIn: ${error.message}`,
        step: 'unexpected_error',
        errorStack: error.stack
      },
      request
    )

    error.alreadyLogged = true
    throw error
  }
}

async function handleSignOut(request, h) {
  if (!request.auth.isAuthenticated) {
    log(
      LogCodes.AUTH.UNAUTHORIZED_ACCESS,
      {
        path: request.path,
        userId: UNKNOWN_USER
      },
      request
    )
    return h.redirect('/')
  }

  log(
    LogCodes.AUTH.SIGN_OUT,
    {
      userId: request.auth.credentials.contactId,
      sessionId: request.auth.credentials.sessionId
    },
    request
  )

  const signOutUrl = await getSignOutUrl(request, request.auth.credentials.token)
  return h.redirect(signOutUrl)
}

async function handleOidcSignOut(request, h) {
  if (request.auth.isAuthenticated) {
    validateState(request, request.query.state)

    log(LogCodes.AUTH.SIGN_OUT, {
      userId: request.auth.credentials.contactId,
      sessionId: request.auth.credentials.sessionId
    })

    if (request.auth.credentials?.sessionId) {
      // Clear the session cache
      await request.server.app.cache.drop(request.auth.credentials.sessionId)
    }
    request.cookieAuth.clear()
  }
  return h.redirect('/')
}

function handleOrganisationRedirect(request, h) {
  // Should never be called as the user should no longer be authenticated with `defra-id` after initial sign in
  // The strategy should redirect the user to the sign in page and they will rejoin the service at the /auth/sign-in-oidc route
  // Adding as safeguard
  const redirect = request.yar.get('redirect') ?? '/home'
  request.yar.clear('redirect')
  // Ensure redirect is a relative path to prevent redirect attacks
  const safeRedirect = getSafeRedirect(redirect)
  return h.redirect(safeRedirect)
}

function handleJourneyUnauthorised(_request, h) {
  return h.view('journey-unauthorised')
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
