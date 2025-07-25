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
      log(LogCodes.SYSTEM.PLUGIN_REGISTRATION, {
        pluginName: 'auth',
        status: 'starting'
      })
      let oidcConfig
      try {
        oidcConfig = await getOidcConfig()

        // Log full OIDC configuration from well-known endpoint
        // Keep for when we deploy to higher environments, won't be needed beyond that
        // @todo remove after higher environment deployment
        log(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
          configType: 'OIDC_WellKnown_Response',
          configValues: {
            issuer: oidcConfig.issuer ?? 'NOT_SET',
            authorization_endpoint: oidcConfig.authorization_endpoint ?? 'NOT_SET',
            token_endpoint: oidcConfig.token_endpoint ?? 'NOT_SET',
            userinfo_endpoint: oidcConfig.userinfo_endpoint ?? 'NOT_SET',
            jwks_uri: oidcConfig.jwks_uri ?? 'NOT_SET',
            end_session_endpoint: oidcConfig.end_session_endpoint ?? 'NOT_SET',
            scopes_supported: oidcConfig.scopes_supported ?? 'NOT_SET',
            response_types_supported: oidcConfig.response_types_supported ?? 'NOT_SET',
            grant_types_supported: oidcConfig.grant_types_supported ?? 'NOT_SET',
            token_endpoint_auth_methods_supported: oidcConfig.token_endpoint_auth_methods_supported ?? 'NOT_SET'
          }
        })
      } catch (error) {
        // Keep for when we deploy to higher environments, won't be needed beyond that
        // @todo remove after higher environment deployment
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
        // Mark the error as already logged to prevent duplicate logging
        error.alreadyLogged = true
        throw error
      }

      // Bell is a third-party plugin that provides a common interface for OAuth 2.0 authentication
      // Used to authenticate users with Defra Identity and a pre-requisite for the Cookie authentication strategy
      // Also used for changing organisations and signing out
      const bellOptions = getBellOptions(oidcConfig)
      server.auth.strategy('defra-id', 'bell', bellOptions)

      // Cookie is a built-in authentication strategy for hapi.js that authenticates users based on a session cookie
      // Used for all non-Defra Identity routes
      // Lax policy required to allow redirection after Defra Identity sign out
      const cookieOptions = getCookieOptions()
      server.auth.strategy('session', 'cookie', cookieOptions)

      // Set the default authentication strategy to session
      // All routes will require authentication unless explicitly set to 'defra-id' or `auth: false`
      server.auth.default('session')

      log(LogCodes.SYSTEM.PLUGIN_REGISTRATION, {
        pluginName: 'auth',
        status: 'completed'
      })
    }
  }
}

function processCredentialsProfile(credentials) {
  try {
    validateCredentials(credentials)
    const payload = decodeTokenPayload(credentials.token)
    validatePayload(payload)
    return createCredentialsProfile(credentials, payload)
  } catch (error) {
    log(LogCodes.AUTH.SIGN_IN_FAILURE, {
      userId: 'unknown',
      error: `Bell profile processing failed: ${error.message}`,
      step: 'bell_profile_processing_error',
      errorDetails: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        alreadyLogged: error.alreadyLogged
      },
      credentialsState: {
        received: !!credentials,
        hasToken: !!credentials?.token,
        tokenLength: credentials?.token?.length || 0
      }
    })

    error.alreadyLogged = true
    throw error
  }
}

function validateCredentials(credentials) {
  if (!credentials) {
    throw new Error('No credentials received from Bell OAuth provider')
  }

  if (!credentials.token) {
    throw new Error('No token received from Defra Identity')
  }
}

function decodeTokenPayload(token) {
  try {
    const decoded = Jwt.token.decode(token)
    const payload = decoded?.decoded?.payload

    if (!payload) {
      log(LogCodes.AUTH.SIGN_IN_FAILURE, {
        userId: 'unknown',
        error: 'JWT payload is empty or invalid',
        step: 'bell_profile_empty_payload',
        decodingDetails: {
          decoded: !!decoded,
          decodedDecoded: !!decoded?.decoded,
          payload,
          payloadType: typeof payload
        }
      })
      throw new Error('Failed to extract payload from JWT token')
    }

    return payload
  } catch (jwtError) {
    log(LogCodes.AUTH.SIGN_IN_FAILURE, {
      userId: 'unknown',
      error: `JWT decode failed: ${jwtError.message}`,
      step: 'bell_profile_jwt_decode_error',
      jwtError: {
        message: jwtError.message,
        stack: jwtError.stack,
        tokenLength: token ? token.length : 0
      }
    })
    throw new Error(`Failed to decode JWT token: ${jwtError.message}`)
  }
}

function validatePayload(payload) {
  const requiredFields = ['contactId', 'firstName', 'lastName']
  const missingFields = requiredFields.filter((field) => !payload[field])

  if (missingFields.length > 0) {
    log(LogCodes.AUTH.SIGN_IN_FAILURE, {
      userId: payload.contactId || 'unknown',
      error: `Missing required JWT payload fields: ${missingFields.join(', ')}`,
      step: 'bell_profile_missing_fields',
      payloadValidation: {
        requiredFields,
        missingFields,
        presentFields: Object.keys(payload),
        contactId: payload.contactId,
        firstName: payload.firstName,
        lastName: payload.lastName
      }
    })
    throw new Error(`Missing required fields in JWT payload: ${missingFields.join(', ')}`)
  }
}

function createCredentialsProfile(credentials, payload) {
  const sessionId = crypto.randomUUID()

  credentials.profile = {
    ...payload,
    crn: payload.contactId,
    name: `${payload.firstName} ${payload.lastName}`,
    organisationId: payload.currentRelationshipId,
    sessionId
  }

  return credentials
}

function getBellOptions(oidcConfig) {
  return {
    provider: {
      name: 'defra-id',
      protocol: 'oauth2',
      useParamsAuth: true,
      auth: oidcConfig.authorization_endpoint,
      token: oidcConfig.token_endpoint,
      scope: ['openid', 'offline_access', config.get('defraId.clientId')],
      profile: function (credentials) {
        return processCredentialsProfile(credentials)
      }
    },
    password: config.get('session.cookie.password'),
    clientId: config.get('defraId.clientId'),
    clientSecret: config.get('defraId.clientSecret'),
    isSecure: config.get('session.cookie.secure'),
    location: function (request) {
      try {
        const redirectParam = request.query.redirect

        if (redirectParam) {
          try {
            const safeRedirect = getSafeRedirect(redirectParam)
            request.yar.set('redirect', safeRedirect)
          } catch (redirectError) {
            log(LogCodes.AUTH.SIGN_IN_FAILURE, {
              userId: 'unknown',
              error: `Failed to store redirect parameter: ${redirectError.message}`,
              step: 'bell_location_redirect_store_error',
              redirectError: {
                message: redirectError.message,
                stack: redirectError.stack,
                originalRedirect: redirectParam
              }
            })
          }
        }

        return config.get('defraId.redirectUrl')
      } catch (error) {
        log(LogCodes.AUTH.SIGN_IN_FAILURE, {
          userId: 'unknown',
          error: `Bell location function failed: ${error.message}`,
          step: 'bell_location_function_error',
          locationError: {
            message: error.message,
            stack: error.stack,
            name: error.name,
            requestPath: request.path,
            requestMethod: request.method
          }
        })

        error.alreadyLogged = true
        throw error
      }
    },
    providerParams: function () {
      return {
        serviceId: config.get('defraId.serviceId')
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
      const userSession = await request.server.app.cache.get(session.sessionId)

      // If a session does not exist, return an invalid session
      if (!userSession) {
        log(LogCodes.AUTH.SESSION_EXPIRED, {
          userId: 'unknown',
          sessionId: session.sessionId,
          path: request.path,
          reason: 'Session not found in cache'
        })

        return { isValid: false }
      }

      // Verify Defra Identity token has not expired
      try {
        const decoded = Jwt.token.decode(userSession.token)
        Jwt.token.verifyTime(decoded)
      } catch (error) {
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
          const { access_token: token, refresh_token: refreshToken } = await refreshTokens(userSession.refreshToken)
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

          return { isValid: false }
        }

        const { access_token: token, refresh_token: refreshToken } = await refreshTokens(userSession.refreshToken)
        userSession.token = token
        userSession.refreshToken = refreshToken
        await request.server.app.cache.set(session.sessionId, userSession)
      }

      // Set the user's details on the request object and allow the request to continue
      // Depending on the service, additional checks can be performed here before returning `isValid: true`
      return { isValid: true, credentials: userSession }
    }
  }
}

export { getBellOptions, getCookieOptions }
