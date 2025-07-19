import crypto from 'crypto'
import Jwt from '@hapi/jwt'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { getSafeRedirect } from '~/src/server/auth/get-safe-redirect.js'
import { refreshTokens } from '~/src/server/auth/refresh-tokens.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

export default {
  plugin: {
    name: 'auth',
    register: async (server) => {
      // Debug log all Defra ID configuration values
      log(LogCodes.AUTH.AUTH_DEBUG, {
        path: 'auth_plugin_registration',
        isAuthenticated: 'system',
        strategy: 'system',
        mode: 'config_debug',
        hasCredentials: false,
        hasToken: false,
        hasProfile: false,
        userAgent: 'server',
        referer: 'none',
        queryParams: {},
        authError: 'none',
        defraIdConfig: {
          wellKnownUrl: config.get('defraId.wellKnownUrl'),
          clientId: config.get('defraId.clientId'),
          clientSecret: config.get('defraId.clientSecret')
            ? '[REDACTED]'
            : 'NOT_SET',
          serviceId: config.get('defraId.serviceId'),
          redirectUrl: config.get('defraId.redirectUrl'),
          signOutRedirectUrl: config.get('defraId.signOutRedirectUrl'),
          refreshTokens: config.get('defraId.refreshTokens')
        }
      })

      let oidcConfig
      try {
        oidcConfig = await getOidcConfig()
        log(LogCodes.AUTH.AUTH_DEBUG, {
          path: 'auth_plugin_registration',
          isAuthenticated: 'system',
          strategy: 'system',
          mode: 'oidc_config_success',
          hasCredentials: false,
          hasToken: false,
          hasProfile: false,
          userAgent: 'server',
          referer: 'none',
          queryParams: {},
          authError: 'none',
          oidcEndpoints: {
            authorizationEndpoint: oidcConfig.authorization_endpoint,
            tokenEndpoint: oidcConfig.token_endpoint,
            jwksUri: oidcConfig.jwks_uri,
            endSessionEndpoint: oidcConfig.end_session_endpoint
          }
        })
      } catch (error) {
        log(LogCodes.AUTH.AUTH_DEBUG, {
          path: 'auth_plugin_registration',
          isAuthenticated: 'system',
          strategy: 'system',
          mode: 'oidc_config_failure',
          hasCredentials: false,
          hasToken: false,
          hasProfile: false,
          userAgent: 'server',
          referer: 'none',
          queryParams: {},
          authError: `OIDC config fetch failed: ${error.message}`,
          errorDetails: {
            message: error.message,
            stack: error.stack,
            wellKnownUrl: config.get('defraId.wellKnownUrl')
          }
        })

        // Mark error as already logged to prevent duplicate logging
        error.alreadyLogged = true
        throw error
      }

      // Bell is a third-party plugin that provides a common interface for OAuth 2.0 authentication
      // Used to authenticate users with Defra Identity and a pre-requisite for the Cookie authentication strategy
      // Also used for changing organisations and signing out
      server.auth.strategy('defra-id', 'bell', getBellOptions(oidcConfig))

      // Cookie is a built-in authentication strategy for hapi.js that authenticates users based on a session cookie
      // Used for all non-Defra Identity routes
      // Lax policy required to allow redirection after Defra Identity sign out
      server.auth.strategy('session', 'cookie', getCookieOptions())

      // Set the default authentication strategy to session
      // All routes will require authentication unless explicitly set to 'defra-id' or `auth: false`
      server.auth.default('session')

      // Add auth debugging hook to log initial authentication attempts
      server.ext('onPreAuth', (request, h) => {
        // Only log debug info for auth-related routes
        if (request.path.startsWith('/auth/')) {
          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: request.path,
            isAuthenticated: 'pre_auth',
            strategy: 'unknown',
            mode: 'initial_request',
            hasCredentials: false,
            hasToken: false,
            hasProfile: false,
            userAgent: request.headers?.['user-agent'] || 'unknown',
            referer: request.headers?.referer || 'none',
            queryParams: request.query || {},
            authError: 'none',
            timestamp: new Date().toISOString()
          })
        }
        return h.continue
      })

      // Add post-auth debugging hook to log authentication results
      server.ext('onPostAuth', (request, h) => {
        // Only log debug info for auth-related routes
        if (request.path.startsWith('/auth/')) {
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
        }
        return h.continue
      })
    }
  }
}

function getBellOptions(oidcConfig) {
  return {
    provider: {
      name: 'defra-id',
      protocol: 'oauth2',
      useParamsAuth: false,
      auth: oidcConfig.authorization_endpoint,
      token: oidcConfig.token_endpoint,
      scope: ['openid', 'offline_access'],
      profile: function (credentials) {
        try {
          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: 'bell_profile_processing',
            isAuthenticated: 'processing',
            strategy: 'bell',
            mode: 'profile_extraction',
            hasCredentials: !!credentials,
            hasToken: !!credentials?.token,
            hasProfile: false,
            userAgent: 'server',
            referer: 'none',
            queryParams: {},
            authError: 'none',
            tokenLength: credentials?.token ? credentials.token.length : 0
          })

          if (!credentials?.token) {
            const error = new Error('No token received from Defra Identity')
            log(LogCodes.AUTH.SIGN_IN_FAILURE, {
              userId: 'unknown',
              error: error.message,
              step: 'bell_profile_no_token'
            })
            throw error
          }

          const decoded = Jwt.token.decode(credentials.token)
          const payload = decoded.decoded.payload

          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: 'bell_profile_processing',
            isAuthenticated: 'processing',
            strategy: 'bell',
            mode: 'jwt_decode',
            hasCredentials: true,
            hasToken: true,
            hasProfile: !!payload,
            userAgent: 'server',
            referer: 'none',
            queryParams: {},
            authError: 'none',
            payloadKeys: Object.keys(payload || {}).join(', ')
          })

          if (!payload) {
            const error = new Error('Failed to decode JWT payload')
            log(LogCodes.AUTH.SIGN_IN_FAILURE, {
              userId: 'unknown',
              error: error.message,
              step: 'bell_profile_jwt_decode_failed'
            })
            throw error
          }

          // Map all JWT properties to the credentials object so it can be stored in the session
          // Add some additional properties to the profile object for convenience
          credentials.profile = {
            ...payload,
            crn: payload.contactId,
            name: `${payload.firstName} ${payload.lastName}`,
            organisationId: payload.currentRelationshipId,
            sessionId: crypto.randomUUID()
          }

          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: 'bell_profile_processing',
            isAuthenticated: 'processing',
            strategy: 'bell',
            mode: 'profile_mapped',
            hasCredentials: true,
            hasToken: true,
            hasProfile: true,
            userAgent: 'server',
            referer: 'none',
            queryParams: {},
            authError: 'none',
            profileName: credentials.profile.name,
            profileId: credentials.profile.contactId
          })

          return credentials
        } catch (error) {
          log(LogCodes.AUTH.SIGN_IN_FAILURE, {
            userId: 'unknown',
            error: `Bell profile processing failed: ${error.message}`,
            step: 'bell_profile_processing_error',
            errorStack: error.stack
          })

          // Mark error as already logged to prevent duplicate logging
          error.alreadyLogged = true
          throw error
        }
      }
    },
    password: config.get('session.cookie.password'),
    clientId: config.get('defraId.clientId'),
    clientSecret: config.get('defraId.clientSecret'),
    isSecure: config.get('session.cookie.secure'),
    location: function (request) {
      try {
        // If request includes a redirect query parameter, store it in the session to allow redirection after authentication
        if (request.query.redirect) {
          // Ensure redirect is a relative path to prevent redirect attacks
          const safeRedirect = getSafeRedirect(request.query.redirect)
          request.yar.set('redirect', safeRedirect)
        }

        return config.get('defraId.redirectUrl')
      } catch (error) {
        log(LogCodes.AUTH.SIGN_IN_FAILURE, {
          userId: 'unknown',
          error: `Bell location function failed: ${error.message}`,
          step: 'bell_location_function_error'
        })

        // Mark error as already logged to prevent duplicate logging
        error.alreadyLogged = true
        throw error
      }
    },
    providerParams: function (request) {
      try {
        const params = {
          serviceId: config.get('defraId.serviceId')
          // p: config.get('defraId.policy')
          // response_mode: 'query'
        }

        // If user intends to switch organisation, force Defra Identity to display the organisation selection screen
        if (request.path === '/auth/organisation') {
          params.forceReselection = true
          // If user has already selected an organisation in another service, pass the organisation Id to force Defra Id to skip the organisation selection screen
          if (request.query.organisationId) {
            params.relationshipId = request.query.organisationId
          }
        }

        return params
      } catch (error) {
        log(LogCodes.AUTH.SIGN_IN_FAILURE, {
          userId: 'unknown',
          error: `Bell provider params function failed: ${error.message}`,
          step: 'bell_provider_params_error'
        })

        // Mark error as already logged to prevent duplicate logging
        error.alreadyLogged = true
        throw error
      }
    }
  }
}

function getCookieOptions() {
  return {
    cookie: {
      password: config.get('session.cookie.password'),
      path: '/',
      isSecure: config.get('session.cookie.secure'),
      isSameSite: 'Lax'
    },
    redirectTo: function (request) {
      return `/auth/sign-in?redirect=${request.url.pathname}${request.url.search}`
    },
    validate: async function (request, session) {
      // Log session validation attempt
      log(LogCodes.AUTH.AUTH_DEBUG, {
        path: request.path,
        isAuthenticated: 'validating',
        strategy: 'session',
        mode: 'cookie_validation',
        hasCredentials: !!session,
        hasToken: 'checking',
        hasProfile: 'checking',
        userAgent: request.headers?.['user-agent'] || 'unknown',
        referer: request.headers?.referer || 'none',
        queryParams: request.query,
        authError: 'none',
        sessionId: session?.sessionId
      })

      const userSession = await request.server.app.cache.get(session.sessionId)

      // If session does not exist, return an invalid session
      if (!userSession) {
        log(LogCodes.AUTH.SESSION_EXPIRED, {
          userId: 'unknown',
          sessionId: session.sessionId,
          path: request.path,
          reason: 'Session not found in cache'
        })

        log(LogCodes.AUTH.AUTH_DEBUG, {
          path: request.path,
          isAuthenticated: false,
          strategy: 'session',
          mode: 'cookie_validation',
          hasCredentials: false,
          hasToken: false,
          hasProfile: false,
          userAgent: request.headers?.['user-agent'] || 'unknown',
          referer: request.headers?.referer || 'none',
          queryParams: request.query,
          authError: 'Session not found in cache',
          sessionId: session?.sessionId
        })

        return { isValid: false }
      }

      // Verify Defra Identity token has not expired
      try {
        const decoded = Jwt.token.decode(userSession.token)
        Jwt.token.verifyTime(decoded)

        // Log successful session validation
        log(LogCodes.AUTH.AUTH_DEBUG, {
          path: request.path,
          isAuthenticated: true,
          strategy: 'session',
          mode: 'cookie_validation',
          hasCredentials: true,
          hasToken: true,
          hasProfile: true,
          userAgent: request.headers?.['user-agent'] || 'unknown',
          referer: request.headers?.referer || 'none',
          queryParams: request.query,
          authError: 'none',
          sessionId: session?.sessionId,
          userId: userSession.contactId
        })
      } catch (error) {
        log(LogCodes.AUTH.AUTH_DEBUG, {
          path: request.path,
          isAuthenticated: false,
          strategy: 'session',
          mode: 'token_validation',
          hasCredentials: true,
          hasToken: true,
          hasProfile: true,
          userAgent: request.headers?.['user-agent'] || 'unknown',
          referer: request.headers?.referer || 'none',
          queryParams: request.query,
          authError: `Token validation failed: ${error.message}`,
          sessionId: session?.sessionId,
          userId: userSession.contactId
        })

        if (!config.get('defraId.refreshTokens')) {
          log(LogCodes.AUTH.SESSION_EXPIRED, {
            userId: userSession.contactId,
            sessionId: session.sessionId,
            path: request.path,
            reason: 'Token expired, refresh disabled'
          })
          return { isValid: false }
        }

        try {
          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: request.path,
            isAuthenticated: 'refreshing',
            strategy: 'session',
            mode: 'token_refresh',
            hasCredentials: true,
            hasToken: true,
            hasProfile: true,
            userAgent: request.headers?.['user-agent'] || 'unknown',
            referer: request.headers?.referer || 'none',
            queryParams: request.query,
            authError: 'Attempting token refresh',
            sessionId: session?.sessionId,
            userId: userSession.contactId
          })

          const { access_token: token, refresh_token: refreshToken } =
            await refreshTokens(userSession.refreshToken)
          userSession.token = token
          userSession.refreshToken = refreshToken
          await request.server.app.cache.set(session.sessionId, userSession)

          log(LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS, {
            userId: userSession.contactId,
            organisationId: userSession.organisationId,
            step: 'token_refresh_success'
          })
        } catch (refreshError) {
          log(LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE, {
            userId: userSession.contactId,
            error: refreshError.message,
            step: 'token_refresh_failed'
          })

          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: request.path,
            isAuthenticated: false,
            strategy: 'session',
            mode: 'token_refresh',
            hasCredentials: true,
            hasToken: false,
            hasProfile: true,
            userAgent: request.headers?.['user-agent'] || 'unknown',
            referer: request.headers?.referer || 'none',
            queryParams: request.query,
            authError: `Token refresh failed: ${refreshError.message}`,
            sessionId: session?.sessionId,
            userId: userSession.contactId
          })

          return { isValid: false }
        }
      }

      // Set the user's details on the request object and allow the request to continue
      // Depending on the service, additional checks can be performed here before returning `isValid: true`
      return { isValid: true, credentials: userSession }
    }
  }
}

export { getBellOptions, getCookieOptions }
