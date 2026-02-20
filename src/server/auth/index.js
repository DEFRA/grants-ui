import { config } from '~/src/config/config.js'
import { getPermissions } from '~/src/server/auth/get-permissions.js'
import { getSafeRedirect } from '~/src/server/auth/get-safe-redirect.js'
import { validateState } from '~/src/server/auth/state.js'
import { verifyToken } from '~/src/server/auth/verify-token.js'
import { getSignOutUrl } from './get-sign-out-url.js'
import { debug, log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import {
  logSuccessfulSignIn,
  logAuthFailure,
  logAuthDebugInfo,
  logTokenExchangeFailure
} from '~/src/server/auth/auth-logging.js'
import { releaseAllApplicationLocksForOwnerFromApi } from '../common/helpers/lock/application-lock.js'
import { ViewError } from '~/src/server/common/utils/errors/ViewError.js'
import { AuthError } from '~/src/server/common/utils/errors/AuthError.js'

const UNKNOWN_USER = 'unknown'
const USER_AGENT = 'user-agent'
const HTTP_FOUND = 302

const AUTH_ENDPOINT_USER_LIMIT = config.get('rateLimit.authEndpointUserLimit')
const AUTH_ENDPOINT_PATH_LIMIT = config.get('rateLimit.authEndpointPathLimit')

/**
 * @param {RequestWithCookieAuth} request
 * @param {ResponseToolkit} h
 */
function handleAuthSignIn(request, h) {
  try {
    // If there's an auth error, log it specifically
    if (request.auth?.error) {
      log(
        LogCodes.AUTH.SIGN_IN_FAILURE,
        {
          userId: UNKNOWN_USER,
          errorMessage: `Authentication error at /auth/sign-in: ${request.auth.error.message}`,
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
    debug(
      LogCodes.AUTH.SIGN_IN_FAILURE,
      {
        userId: UNKNOWN_USER,
        errorMessage: `Error during /auth/sign-in redirect: ${error.message}`,
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
          errorMessage: `Bell/OAuth error at ${request.path}: ${String(error.message)}`,
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
            errorMessage: 'OAuth2 token exchange failed - possible configuration issue',
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
  // Register defra-id related routes

  server.route({
    method: 'GET',
    path: '/auth/sign-in',
    options: {
      auth: { strategy: 'defra-id', mode: 'try' },
      plugins: {
        'hapi-rate-limit': {
          userLimit: AUTH_ENDPOINT_USER_LIMIT,
          pathLimit: AUTH_ENDPOINT_PATH_LIMIT
        }
      }
    },
    handler: handleAuthSignIn
  })

  server.route({
    method: ['GET'],
    path: '/auth/sign-in-oidc',
    options: {
      auth: { strategy: 'defra-id', mode: 'try' },
      plugins: {
        'hapi-rate-limit': {
          userLimit: AUTH_ENDPOINT_USER_LIMIT,
          pathLimit: AUTH_ENDPOINT_PATH_LIMIT
        }
      }
    },
    handler: handleOidcSignIn
  })

  server.route({
    method: 'GET',
    path: '/auth/sign-out',
    options: {
      plugins: {
        'hapi-rate-limit': {
          userLimit: AUTH_ENDPOINT_USER_LIMIT,
          pathLimit: AUTH_ENDPOINT_PATH_LIMIT
        }
      }
    },
    handler: handleSignOut
  })

  server.route({
    method: 'GET',
    path: '/auth/sign-out-oidc',
    options: {
      plugins: {
        'hapi-rate-limit': {
          userLimit: AUTH_ENDPOINT_USER_LIMIT,
          pathLimit: AUTH_ENDPOINT_PATH_LIMIT
        }
      }
    },
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

  server.route({
    method: 'GET',
    path: '/auth/journey-unauthorised',
    handler: handleJourneyUnauthorised
  })
}

/**
 * @satisfies {ServerRegisterPluginObject}
 */
export const auth = {
  plugin: {
    name: 'auth-router',
    register(server) {
      setupAuthRoutes(server)
      setupBellOAuthErrorHandling(server)
    }
  }
}

/**
 * @param {RequestWithCookieAuth} request
 * @param {ResponseToolkit} h
 */
function handleUnauthenticatedRequest(request, h) {
  const authErrorMessage = request.auth?.error?.message || 'Not authenticated'
  const hasCredentials = !!request.auth?.credentials

  logAuthFailure(request, authErrorMessage, hasCredentials)

  if (hasCredentials && authErrorMessage?.includes('access token')) {
    logTokenExchangeFailure(request, hasCredentials)
  }

  return renderUnauthorisedView(request, h)
}

/**
 * @param {RequestWithCookieAuth} request
 * @param {ResponseToolkit} h
 */
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
      viewAttempt: 'errors/401.njk',
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
  } catch (error) {
    const viewError = new ViewError({
      message: `Failed to render unauthorised view`,
      status: 200,
      source: 'auth-handler',
      reason: 'view_render_failure',
      userId: UNKNOWN_USER,
      step: 'view_render_error',
      errorStack: error.stack,
      viewError: 'errors/401.njk',
      serverWorkingDir: process.cwd()
    })
    viewError.from(error)
    throw viewError
  }
}

/**
 * @param {RequestWithCookieAuth} request
 * @param {ResponseToolkit} h
 */
async function processAuthenticatedSignIn(request, h) {
  const { profile, token, refreshToken } = request.auth.credentials

  validateProfileData(profile)

  await verifyToken(token)

  const { role, scope } = getPermissionsOrDefaults(profile, token)
  await storeSessionData(request, profile, role, scope, token, refreshToken)
  setCookieAuth(request, profile)

  logSuccessfulSignIn(profile, role, scope)

  return redirectAfterSignIn(request, h)
}

function validateProfileData(profile) {
  if (!profile?.sessionId) {
    const authError = new AuthError({
      message: 'Missing required profile data or sessionId',
      status: 500,
      source: 'validate-profile-data',
      reason: 'profile_validation_failure'
    })
    authError.logCode = LogCodes.AUTH.SIGN_IN_FAILURE
    throw authError
  }
}

function getPermissionsOrDefaults(profile, token) {
  try {
    const permissions = getPermissions(profile.crn, profile.organisationId, token)
    return { role: permissions.role, scope: permissions.scope }
  } catch (permissionsError) {
    debug(LogCodes.AUTH.SIGN_IN_FAILURE, {
      userId: profile.contactId,
      errorMessage: `Failed to get permissions: ${permissionsError.message}`,
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

/**
 * @param {RequestWithCookieAuth} request
 * @param {any} profile
 * @param {string} role
 * @param {string[]} scope
 * @param {string} token
 * @param {string} refreshToken
 */
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
    const authError = new AuthError({
      message: 'Failed to store session data in cache',
      status: 500,
      source: 'auth-handler',
      reason: 'cache_set_failure'
    })
    authError.from(cacheError)
    throw authError
  }
}

/**
 * @param {RequestWithCookieAuth} request
 * @param profile
 */
function setCookieAuth(request, profile) {
  try {
    request.cookieAuth.set({ sessionId: profile.sessionId })
  } catch (cookieError) {
    const authError = new AuthError({
      message: 'Failed to set cookie auth',
      step: 'cookie_auth_set_error',
      source: 'auth-handler',
      reason: 'cookie_set_failure'
    })
    authError.from(cookieError)
    throw authError
  }
}

/**
 *
 * @param {RequestWithCookieAuth} request
 * @param {ResponseToolkit} h
 * @throws {AuthError}
 * @returns {*}
 */
function redirectAfterSignIn(request, h) {
  try {
    const redirect = request.yar.get('redirect') ?? '/home'
    request.yar.clear('redirect')
    const safeRedirect = getSafeRedirect(redirect)
    return h.redirect(safeRedirect)
  } catch (redirectError) {
    const authError = new AuthError({
      message: 'Failed to redirect after sign in',
      status: 500,
      source: 'redirect-after-signin',
      reason: 'redirect_failure'
    })
    authError.logCode = LogCodes.AUTH.SIGN_IN_FAILURE
    authError.from(redirectError)
    throw authError
  }
}

/**
 * @param {RequestWithCookieAuth} request
 * @param {ResponseToolkit} h
 */
async function handleOidcSignIn(request, h) {
  try {
    logAuthDebugInfo(request)

    if (!request.auth.isAuthenticated) {
      return handleUnauthenticatedRequest(request, h)
    }

    return await processAuthenticatedSignIn(request, h)
  } catch (error) {
    const authError = new AuthError({
      message: 'Unexpected error during OIDC sign in',
      status: 500,
      source: 'oidc-sign-in',
      reason: 'unexpected_error'
    })
    authError.logCode = LogCodes.AUTH.SIGN_IN_FAILURE
    authError.from(error)
    throw authError
  }
}

/**
 * @param {RequestWithCookieAuth} request
 * @param {ResponseToolkit} h
 */
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

  const ownerId = request.auth.credentials.contactId

  log(LogCodes.APPLICATION_LOCKS.RELEASE_ATTEMPTED, {
    ownerId
  })
  releaseAllApplicationLocksForOwnerFromApi({ ownerId })
    .then((result) => {
      if (!result.ok) {
        log(LogCodes.APPLICATION_LOCKS.RELEASE_FAILED, {
          ownerId,
          releasedCount: result.releasedCount
        })
      }
    })
    .catch((err) => {
      log(LogCodes.APPLICATION_LOCKS.RELEASE_FAILED, {
        ownerId,
        errorName: err.name,
        errorMessage: err.message
      })
    })

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

/**
 * @param {RequestWithCookieAuth} request
 * @param {ResponseToolkit} h
 */
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

/**
 * @param {RequestWithCookieAuth} request
 * @param {ResponseToolkit} h
 */
function handleOrganisationRedirect(request, h) {
  const redirect = request.yar.get('redirect') ?? '/home'
  request.yar.clear('redirect')
  const safeRedirect = getSafeRedirect(redirect)
  return h.redirect(safeRedirect)
}

/**
 * @param {RequestWithCookieAuth} _request
 * @param {ResponseToolkit} h
 */
function handleJourneyUnauthorised(_request, h) {
  return h.view('errors/401')
}

/**
 * @typedef {import('@hapi/hapi').ServerRegisterPluginObject<void>} ServerRegisterPluginObject
 * @typedef {import('@hapi/hapi').ResponseToolkit} ResponseToolkit
 * @typedef {import('@hapi/hapi').Server} Server
 * @typedef {{ set: (value: any) => void, clear: () => void }} CookieAuth
 * @typedef {{ get: (id: string) => Promise<any>, set: (id: string, value: any) => Promise<void>, drop: (id: string) => Promise<void> }} SessionCache
 * @typedef {import('@hapi/hapi').Request & { server: Server & { app: { cache: SessionCache } }, cookieAuth: CookieAuth, yar: any, auth: { credentials: any, isAuthenticated: boolean, error?: any, strategy: string, mode: string } }} RequestWithCookieAuth
 */
