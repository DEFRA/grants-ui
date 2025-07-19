import { getPermissions } from '~/src/server/auth/get-permissions.js'
import { getSafeRedirect } from '~/src/server/auth/get-safe-redirect.js'
import { validateState } from '~/src/server/auth/state.js'
import { verifyToken } from '~/src/server/auth/verify-token.js'
import { getSignOutUrl } from './get-sign-out-url.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

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
        handler: (request, h) => {
          try {
            // Log the authentication state at the /auth/sign-in endpoint
            log(LogCodes.AUTH.AUTH_DEBUG, {
              path: request.path,
              isAuthenticated: request.auth?.isAuthenticated || 'unknown',
              strategy: request.auth?.strategy || 'unknown',
              mode: request.auth?.mode || 'unknown',
              hasCredentials: !!request.auth?.credentials,
              hasToken: !!request.auth?.credentials?.token,
              hasProfile: !!request.auth?.credentials?.profile,
              userAgent: request.headers?.['user-agent'] || 'unknown',
              referer: request.headers?.referer || 'none',
              queryParams: request.query || {},
              authError: request.auth?.error?.message || 'none',
              timestamp: new Date().toISOString()
            })

            // If there's an auth error, log it specifically
            if (request.auth?.error) {
              log(LogCodes.AUTH.SIGN_IN_FAILURE, {
                userId: 'unknown',
                error: `Authentication error at /auth/sign-in: ${request.auth.error.message}`,
                step: 'auth_sign_in_route_error',
                authState: {
                  isAuthenticated: request.auth.isAuthenticated,
                  strategy: request.auth.strategy,
                  mode: request.auth.mode
                }
              })
            }

            // Log that we're about to redirect
            log(LogCodes.AUTH.AUTH_DEBUG, {
              path: request.path,
              isAuthenticated: 'redirecting',
              strategy: 'auth_sign_in',
              mode: 'redirect_to_home',
              hasCredentials: false,
              hasToken: false,
              hasProfile: false,
              userAgent: request.headers?.['user-agent'] || 'unknown',
              referer: request.headers?.referer || 'none',
              queryParams: request.query || {},
              authError: 'none',
              redirectTarget: '/home'
            })

            return h.redirect('/home')
          } catch (error) {
            // Log any errors that occur during the redirect
            log(LogCodes.AUTH.SIGN_IN_FAILURE, {
              userId: 'unknown',
              error: `Error during /auth/sign-in redirect: ${error.message}`,
              step: 'auth_sign_in_redirect_error',
              errorStack: error.stack,
              authState: {
                isAuthenticated: request.auth?.isAuthenticated,
                strategy: request.auth?.strategy,
                mode: request.auth?.mode
              }
            })

            // Instead of throwing the error, redirect to an error page or home page
            // This prevents the 500 error from being shown to the user
            return h.redirect('/home').code(302)
          }
        }
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
  }
}

async function handleOidcSignIn(request, h) {
  try {
    // First, log detailed authentication debug information
    const authDebugInfo = {
      path: request.path,
      isAuthenticated: request.auth.isAuthenticated,
      strategy: request.auth?.strategy,
      mode: request.auth?.mode,
      hasCredentials: !!request.auth?.credentials,
      hasToken: !!request.auth?.credentials?.token,
      hasProfile: !!request.auth?.credentials?.profile,
      userAgent: request.headers?.['user-agent'] || 'unknown',
      referer: request.headers?.referer || 'none',
      queryParams: request.query,
      authError: request.auth?.error?.message || 'none'
    }

    // Always log debug info to help with troubleshooting
    log(LogCodes.AUTH.AUTH_DEBUG, authDebugInfo)

    // If the user is not authenticated, redirect to the home page
    // This should only occur if the user tries to access the sign-in page directly and not part of the sign-in flow
    // eg if the user has bookmarked the Defra Identity sign-in page or they have signed out and tried to go back in the browser
    if (!request.auth.isAuthenticated) {
      // Log more detailed error information
      const errorDetails = {
        path: request.path,
        userId: 'unknown',
        error: request.auth?.error?.message || 'Not authenticated',
        isAuthenticated: request.auth.isAuthenticated,
        strategy: request.auth?.strategy,
        hasCredentials: !!request.auth?.credentials,
        artifacts: request.auth?.artifacts ? 'present' : 'none',
        userAgent: request.headers?.['user-agent'] || 'unknown',
        referer: request.headers?.referer || 'none'
      }

      log(LogCodes.AUTH.UNAUTHORIZED_ACCESS, errorDetails)

      // Additional detailed failure logging
      log(LogCodes.AUTH.SIGN_IN_FAILURE, {
        userId: 'unknown',
        error: `Authentication failed at OIDC sign-in. Auth state: ${JSON.stringify(
          {
            isAuthenticated: request.auth.isAuthenticated,
            strategy: request.auth?.strategy,
            mode: request.auth?.mode,
            error: request.auth?.error?.message,
            hasCredentials: !!request.auth?.credentials
          }
        )}`,
        step: 'oidc_sign_in_authentication_check'
      })

      // Debug logging before attempting to render unauthorised view
      log(LogCodes.AUTH.AUTH_DEBUG, {
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
      })

      try {
        const result = h.view('unauthorised')
        log(LogCodes.AUTH.AUTH_DEBUG, {
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
        })
        return result
      } catch (viewError) {
        log(LogCodes.AUTH.SIGN_IN_FAILURE, {
          userId: 'unknown',
          error: `Failed to render unauthorised view: ${viewError.message}`,
          step: 'view_render_error',
          errorStack: viewError.stack,
          viewError: 'unauthorised.njk',
          serverWorkingDir: process.cwd()
        })
        throw viewError
      }
    }

    // Log successful authentication details
    const { profile, token, refreshToken } = request.auth.credentials

    // Validate that we have the required profile data
    if (!profile?.sessionId) {
      log(LogCodes.AUTH.SIGN_IN_FAILURE, {
        userId: profile?.contactId || 'unknown',
        error: 'Missing required profile data or sessionId',
        step: 'profile_validation',
        profileData: {
          hasProfile: !!profile,
          hasSessionId: !!profile?.sessionId,
          profileKeys: Object.keys(profile || {})
        }
      })
      // Throw an error to let the error handling middleware deal with it properly
      throw new Error('Authentication failed: Missing required profile data')
    }

    log(LogCodes.AUTH.SIGN_IN_ATTEMPT, {
      userId: profile.contactId,
      organisationId: profile.currentRelationshipId,
      profileData: JSON.stringify({
        hasToken: !!token,
        hasRefreshToken: !!refreshToken,
        hasProfile: !!profile,
        profileKeys: Object.keys(profile || {}),
        tokenLength: token ? token.length : 0
      })
    })

    // verify token returned from Defra Identity against public key
    await verifyToken(token)

    // Typically permissions for the selected organisation would be available in the `roles` property of the token
    // However, when signing in with RPA credentials, the roles only include the role name and not the permissions
    // Therefore, we need to make additional API calls to get the permissions from Siti Agri
    // These calls are authenticated using the token returned from Defra Identity
    let role, scope
    try {
      const permissions = getPermissions(
        profile.crn,
        profile.organisationId,
        token
      )
      role = permissions.role
      scope = permissions.scope
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
      // Use default permissions if getPermissions fails
      role = 'user'
      scope = ['user']
    }

    // Store token and all useful data in the session cache
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
      log(LogCodes.AUTH.SIGN_IN_FAILURE, {
        userId: profile.contactId,
        error: `Failed to store session in cache: ${cacheError.message}`,
        step: 'cache_set_error',
        sessionId: profile.sessionId
      })
      throw cacheError
    }

    // Create a new session using cookie authentication strategy which is used for all subsequent requests
    try {
      request.cookieAuth.set({ sessionId: profile.sessionId })
    } catch (cookieError) {
      log(LogCodes.AUTH.SIGN_IN_FAILURE, {
        userId: profile.contactId,
        error: `Failed to set cookie auth: ${cookieError.message}`,
        step: 'cookie_auth_set_error',
        sessionId: profile.sessionId
      })
      throw cookieError
    }

    log(LogCodes.AUTH.SIGN_IN_SUCCESS, {
      userId: profile.contactId,
      organisationId: profile.currentRelationshipId,
      role,
      scope: scope.join(', '),
      sessionId: profile.sessionId
    })

    // Redirect user to the page they were trying to access before signing in or to the home page if no redirect was set
    try {
      const redirect = request.yar.get('redirect') ?? '/home'
      request.yar.clear('redirect')
      // Ensure redirect is a relative path to prevent redirect attacks
      const safeRedirect = getSafeRedirect(redirect)
      return h.redirect(safeRedirect)
    } catch (redirectError) {
      log(LogCodes.AUTH.SIGN_IN_FAILURE, {
        userId: profile.contactId,
        error: `Failed to redirect after sign in: ${redirectError.message}`,
        step: 'redirect_error',
        sessionId: profile.sessionId
      })
      // Throw an error to let the error handling middleware deal with it properly
      throw new Error(
        `Failed to redirect after sign in: ${redirectError.message}`
      )
    }
  } catch (error) {
    log(LogCodes.AUTH.SIGN_IN_FAILURE, {
      userId: 'unknown',
      error: `Unexpected error in handleOidcSignIn: ${error.message}`,
      step: 'unexpected_error',
      errorStack: error.stack
    })

    error.alreadyLogged = true
    throw error
  }
}

async function handleSignOut(request, h) {
  if (!request.auth.isAuthenticated) {
    log(LogCodes.AUTH.UNAUTHORIZED_ACCESS, {
      path: request.path,
      userId: 'unknown'
    })
    return h.redirect('/')
  }

  log(LogCodes.AUTH.SIGN_OUT, {
    userId: request.auth.credentials.contactId,
    sessionId: request.auth.credentials.sessionId
  })

  const signOutUrl = await getSignOutUrl(
    request,
    request.auth.credentials.token
  )
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

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
