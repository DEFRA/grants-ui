import { getPermissions } from '~/src/server/auth/get-permissions.js'
import { getSafeRedirect } from '~/src/server/auth/get-safe-redirect.js'
import { validateState } from '~/src/server/auth/state.js'
import { verifyToken } from '~/src/server/auth/verify-token.js'
import { getSignOutUrl } from './get-sign-out-url.js'

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const auth = {
  plugin: {
    name: 'auth-router',
    register(server) {
      server.route({
        method: 'GET',
        path: '/auth/sign-in',
        options: {
          auth: { strategy: 'defra-id', mode: 'try' }
        },
        handler: (_request, h) => h.redirect('/home')
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
      // Temporary debug route for authentication troubleshooting
      server.route({
        method: 'GET',
        path: '/auth/debug',
        options: {
          auth: { mode: 'try' }
        },
        handler: (request, h) => {
          const debugInfo = {
            timestamp: new Date().toISOString(),
            requestPath: request.path,
            authStrategy: request.auth.strategy,
            authMode: request.auth.mode,
            isAuthenticated: request.auth.isAuthenticated,
            authError: request.auth.error,
            sessionId: request.auth.credentials?.sessionId,
            crn: request.auth.credentials?.crn,
            organisationId: request.auth.credentials?.organisationId,
            role: request.auth.credentials?.role,
            scope: request.auth.credentials?.scope
          }

          // Log the debug info
          request.server.log(['info', 'auth'], {
            message: 'Authentication debug info requested',
            debugInfo
          })

          // Log with enhanced visibility
          request.server.log(
            ['info', 'auth'],
            `DEBUG INFO: ${JSON.stringify(debugInfo, null, 2)}`
          )

          return h.response(debugInfo).code(200)
        }
      })
    }
  }
}

async function handleOidcSignIn(request, h) {
  // If the user is not authenticated, redirect to the home page
  // This should only occur if the user tries to access the sign-in page directly and not part of the sign-in flow
  // eg if the user has bookmarked the Defra Identity sign-in page or they have signed out and tried to go back in the browser
  if (!request.auth.isAuthenticated) {
    // Enhanced logging for debugging authentication failures
    const authError = {
      message: 'OIDC authentication failed',
      errorMessage: request.auth.error?.message || 'Unknown error',
      errorType: request.auth.error?.name || 'UnknownError',
      errorDetails: request.auth.error,
      strategy: request.auth.strategy,
      mode: request.auth.mode,
      requestPath: request.path,
      requestMethod: request.method,
      userAgent: request.headers['user-agent'],
      timestamp: new Date().toISOString()
    }

    request.server.log(['error', 'auth'], authError)

    // Log with enhanced visibility
    request.server.log(
      ['error', 'auth'],
      `AUTH FAILURE: ${JSON.stringify(authError, null, 2)}`
    )

    // Check if this is a user-initiated failure or a system issue
    if (request.auth.error?.message?.includes('access_denied')) {
      // User cancelled authentication - redirect to sign-in
      return h.redirect('/auth/sign-in')
    }

    return h.view('auth/unauthorised')
  }

  // Log successful authentication start
  request.server.log(['info', 'auth'], {
    message: 'OIDC authentication successful, processing user',
    requestPath: request.path,
    timestamp: new Date().toISOString()
  })

  const { profile, token, refreshToken } = request.auth.credentials
  // verify token returned from Defra Identity against public key
  try {
    await verifyToken(token)
    request.server.log(['info', 'auth'], {
      message: 'Token verification successful',
      crn: profile.crn,
      organisationId: profile.organisationId
    })
  } catch (error) {
    request.server.log(['error', 'auth'], {
      message: 'Token verification failed',
      error: error.message,
      crn: profile.crn,
      organisationId: profile.organisationId
    })
    request.server.log(
      ['error', 'auth'],
      `TOKEN VERIFICATION FAILURE: ${error.message}`
    )
    return h.view('auth/unauthorised')
  }

  // Typically permissions for the selected organisation would be available in the `roles` property of the token
  // However, when signing in with RPA credentials, the roles only include the role name and not the permissions
  // Therefore, we need to make additional API calls to get the permissions from Siti Agri
  // These calls are authenticated using the token returned from Defra Identity
  try {
    const { role, scope } = getPermissions(
      profile.crn,
      profile.organisationId,
      token
    )

    request.server.log(['info', 'auth'], {
      message: 'Permissions retrieved successfully',
      crn: profile.crn,
      organisationId: profile.organisationId,
      role,
      scope
    })

    // Store token and all useful data in the session cache
    await request.server.app.cache.set(profile.sessionId, {
      isAuthenticated: true,
      ...profile,
      role,
      scope,
      token,
      refreshToken
    })

    // Create a new session using cookie authentication strategy which is used for all subsequent requests
    request.cookieAuth.set({ sessionId: profile.sessionId })

    // Redirect user to the page they were trying to access before signing in or to the home page if no redirect was set
    const redirect = request.yar.get('redirect') ?? '/home'
    request.yar.clear('redirect')
    // Ensure redirect is a relative path to prevent redirect attacks
    const safeRedirect = getSafeRedirect(redirect)

    request.server.log(['info', 'auth'], {
      message: 'Authentication completed successfully',
      crn: profile.crn,
      organisationId: profile.organisationId,
      redirectTo: safeRedirect
    })

    return h.redirect(safeRedirect)
  } catch (error) {
    request.server.log(['error', 'auth'], {
      message: 'Permission retrieval failed',
      error: error.message,
      crn: profile.crn,
      organisationId: profile.organisationId
    })
    request.server.log(
      ['error', 'auth'],
      `PERMISSION RETRIEVAL FAILURE: ${error.message}`
    )
    return h.view('auth/unauthorised')
  }
}

async function handleSignOut(request, h) {
  if (!request.auth.isAuthenticated) {
    return h.redirect('/')
  }
  const signOutUrl = await getSignOutUrl(
    request,
    request.auth.credentials.token
  )
  return h.redirect(signOutUrl)
}

async function handleOidcSignOut(request, h) {
  if (request.auth.isAuthenticated) {
    validateState(request, request.query.state)
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

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
