import Jwt from '@hapi/jwt'
import crypto from 'node:crypto'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { getSafeRedirect } from '~/src/server/auth/get-safe-redirect.js'
import { refreshTokens } from '~/src/server/auth/refresh-tokens.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const defraIdEnabled = config.get('defraId.enabled')

async function setupOidcConfig() {
  try {
    const oidcConfig = await getOidcConfig()

    // Log full OIDC configuration from well-known endpoint
    // Keep for when we deploy to higher environments, won't be needed beyond that
    log(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
      configType: 'OIDC_WellKnown_Response',
      configValues: getLoggingDetails(oidcConfig)
    })

    return oidcConfig
  } catch (error) {
    // Keep for when we deploy to higher environments, won't be needed beyond that
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
}

function setConfiguration(baseConfig) {
  return function (key, defaultValue = 'NOT_SET') {
    return baseConfig[key] ?? defaultValue
  }
}

function getLoggingDetails(oidcConfig) {
  const getOidcValue = setConfiguration(oidcConfig)

  return {
    issuer: getOidcValue('issuer'),
    authorization_endpoint: getOidcValue('authorization_endpoint'),
    token_endpoint: getOidcValue('token_endpoint'),
    userinfo_endpoint: getOidcValue('userinfo_endpoint'),
    jwks_uri: getOidcValue('jwks_uri'),
    end_session_endpoint: getOidcValue('end_session_endpoint'),
    scopes_supported: getOidcValue('scopes_supported'),
    response_types_supported: getOidcValue('response_types_supported'),
    grant_types_supported: getOidcValue('grant_types_supported'),
    token_endpoint_auth_methods_supported: getOidcValue('token_endpoint_auth_methods_supported')
  }
}

function setupAuthStrategies(server, oidcConfig) {
  // Cookie is a built-in authentication strategy for hapi.js that authenticates users based on a session cookie
  // Used for all non-Defra Identity routes
  // Lax policy required to allow redirection after Defra Identity sign out
  const cookieOptions = getCookieOptions()
  server.auth.strategy('session', 'cookie', cookieOptions)

  // Only register the defra-id strategy if it's enabled in the config and oidcConfig is available
  if (defraIdEnabled && oidcConfig) {
    // Bell is a third-party plugin that provides a common interface for OAuth 2.0 authentication
    // Used to authenticate users with Defra Identity and a pre-requisite for the Cookie authentication strategy
    // Also used for changing organisations and signing out
    const bellOptions = getBellOptions(oidcConfig)
    server.auth.strategy('defra-id', 'bell', bellOptions)
  }

  server.ext('onPostAuth', (request, h) => mapPayloadToProfile(request, h))
}

export default {
  plugin: {
    name: 'auth',
    register: async (server) => {
      log(LogCodes.SYSTEM.PLUGIN_REGISTRATION, {
        pluginName: 'auth',
        status: 'starting'
      })

      let oidcConfig = null
      // Only fetch OIDC configuration if defra-id is enabled
      if (defraIdEnabled) {
        oidcConfig = await setupOidcConfig()
      }

      setupAuthStrategies(server, oidcConfig)

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
    throw jwtError
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
    sessionId
  }
  return credentials
}

function extractFarmDetails(relationships) {
  const parts = relationships?.split(':') || []

  const LENGTH_OF_NORMAL_RELATIONSHIP_ENTRY = 6
  const LAST_INDEX_BEFORE_ORGANISATION_NAME = 2
  const INDEX_OF_LAST_KNOWN_PARTS_IN_COLLECTION = 3

  // Define indices for relationship parts
  const RELATIONSHIP_ID_INDEX = 0
  const ORGANISATION_ID_INDEX = 1
  const ORGANISATION_LOA_INDEX = parts.length - INDEX_OF_LAST_KNOWN_PARTS_IN_COLLECTION
  const RELATIONSHIP_INDEX = parts.length - 2
  const RELATIONSHIP_LOA_INDEX = parts.length - 1

  if (parts.length < LENGTH_OF_NORMAL_RELATIONSHIP_ENTRY) {
    throw new Error(
      'extractFarmDetails: Attempting to extract farm details from relationship: Invalid format: not enough fields'
    )
  }

  if (parts.length === LENGTH_OF_NORMAL_RELATIONSHIP_ENTRY) {
    return parts
  }

  // Organisation name spans from index 2 to (length - 4)
  const orgName = parts.slice(LAST_INDEX_BEFORE_ORGANISATION_NAME, ORGANISATION_LOA_INDEX).join(':')

  return [
    parts[RELATIONSHIP_ID_INDEX],
    parts[ORGANISATION_ID_INDEX],
    orgName,
    parts[ORGANISATION_LOA_INDEX],
    parts[RELATIONSHIP_INDEX],
    parts[RELATIONSHIP_LOA_INDEX]
  ]
}

export function mapPayloadToProfile(request, h) {
  if (request.auth.isAuthenticated) {
    // Get the actual user data, handling both nested and flat structures
    const userData = request.auth.credentials.profile || request.auth.credentials

    const currentRelationship = (userData?.relationships || []).find(
      (relationship) => relationship.split(':')[0] === userData.currentRelationshipId
    )
    // eslint-disable-next-line no-unused-vars
    const [relationshipId, organisationId, organisationName, _organisationLoa, _relationship, _relationshipLoa] =
      extractFarmDetails(currentRelationship)

    const existingCreds = request.auth.credentials

    request.auth.credentials = {
      ...existingCreds,
      sbi: String(organisationId),
      crn: String(userData.contactId),
      name: `${userData.firstName} ${userData.lastName}`,
      organisationId: String(organisationId),
      organisationName,
      relationshipId: String(relationshipId)
    }
  }

  return h.continue
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
      name: config.get('session.cookie.name'),
      password: config.get('session.cookie.password'),
      path: '/',
      ttl: config.get('session.cookie.ttl'),
      isSecure: config.get('session.cookie.secure'),
      isSameSite: 'Lax'
    },
    redirectTo: function (request) {
      // If defra-id is enabled, redirect to sign-in
      if (defraIdEnabled) {
        return `/auth/sign-in?redirect=${request.url.pathname}${request.url.search}`
      }
      return '/'
    },
    validate: async function (request, session) {
      const userSession = await request.server.app.cache.get(session.sessionId)

      // If a session does not exist, return an invalid session
      if (!userSession) {
        log(
          LogCodes.AUTH.SESSION_EXPIRED,
          {
            userId: 'unknown',
            sessionId: session.sessionId,
            path: request.path,
            reason: 'Session not found in cache'
          },
          request
        )

        return { isValid: false }
      }

      // Skip token verification if defra-id is disabled
      if (defraIdEnabled && userSession.token) {
        // Verify Defra Identity token has not expired
        try {
          const decoded = Jwt.token.decode(userSession.token)
          Jwt.token.verifyTime(decoded)
        } catch (tokenError) {
          if (!config.get('defraId.refreshTokens')) {
            log(
              LogCodes.AUTH.SESSION_EXPIRED,
              {
                userId: userSession.contactId,
                sessionId: session.sessionId,
                path: request.path,
                reason: 'Token expired, refresh disabled',
                error: tokenError.message
              },
              request
            )
            return { isValid: false }
          }

          try {
            const { access_token: newToken, refresh_token: newRefreshToken } = await refreshTokens(
              userSession.refreshToken
            )
            userSession.token = newToken
            userSession.refreshToken = newRefreshToken
            await request.server.app.cache.set(session.sessionId, userSession)

            log(
              LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS,
              {
                userId: userSession.contactId,
                organisationId: userSession.organisationId,
                step: 'token_refresh_success'
              },
              request
            )
          } catch (refreshError) {
            log(
              LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE,
              {
                userId: userSession.contactId,
                error: refreshError.message,
                step: 'token_refresh_failed',
                originalTokenError: tokenError.message
              },
              request
            )

            return { isValid: false }
          }
        }
      }

      // Set the user's details on the request object and allow the request to continue
      // Depending on the service, additional checks can be performed here before returning `isValid: true`
      return { isValid: true, credentials: userSession }
    }
  }
}

export { getBellOptions, getCookieOptions }
