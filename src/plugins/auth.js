import Jwt from '@hapi/jwt'
import crypto from 'node:crypto'
import { config } from '~/src/config/config.js'
import { getOidcConfig } from '~/src/server/auth/get-oidc-config.js'
import { getSafeRedirect } from '~/src/server/auth/get-safe-redirect.js'
import { refreshTokens } from '~/src/server/auth/refresh-tokens.js'
import { AuthError } from '~/src/server/common/utils/errors/AuthError.js'
import { log, debug, LogCodes, logger } from '~/src/server/common/helpers/logging/log.js'

export const AUTH_SESSION_VERSION = 2

const PROFILE_FIELDS_TO_KEEP_IN_SESSION_CACHE = /** @type {const} */ ([
  'sessionId',
  'contactId',
  'firstName',
  'lastName',
  'currentRelationshipId',
  'relationships'
])

/**
 * @returns {Promise<OidcConfig>}
 */
async function setupOidcConfig() {
  const startTime = Date.now()
  let caughtError
  try {
    logger.debug('Starting OIDC configuration fetch from well-known endpoint')
    const oidcConfig = await getOidcConfig()

    // Log full OIDC configuration from well-known endpoint
    // Keep for when we deploy to higher environments, won't be needed beyond that
    log(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
      configType: 'OIDC_WellKnown_Response',
      configValues: getLoggingDetails(oidcConfig)
    })
    logger.debug(`Completed OIDC configuration fetch from well-known endpoint ${Date.now() - startTime}ms`)

    return oidcConfig
  } catch (error) {
    caughtError = error
  }

  // Handled outside the catch so the lint rule that bars log helpers inside
  // catch blocks is satisfied. AuthError.from() stores the cause in a Set that
  // pino can't serialize, so log the underlying error's code/message via a log
  // code here before it's swallowed.
  const err = /** @type {Error & { code?: string }} */ (caughtError)
  log(LogCodes.AUTH.OIDC_CONFIG_FETCH_FAILURE, {
    durationMs: Date.now() - startTime,
    code: err.code ?? 'n/a',
    errorMessage: err.message
  })
  const authError = new AuthError({
    message: 'OIDC config fetch failed',
    source: 'setupOidcConfig',
    reason: 'oidc_config_failure',
    wellKnownUrl: config.get('defraId.wellKnownUrl')
  })
  authError.logCode = LogCodes.AUTH.SIGN_IN_FAILURE
  throw authError.from(/** @type {Error} */ (caughtError))
}

/**
 * @param {Record<string, unknown>} baseConfig
 */
function setConfiguration(baseConfig) {
  return function (/** @type {string} */ key, /** @type {unknown} */ defaultValue = 'NOT_SET') {
    return baseConfig[key] ?? defaultValue
  }
}

/**
 * @param {OidcConfig} oidcConfig
 * @returns {Record<string, unknown>}
 */
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

/**
 * @param {Server} server
 * @param {OidcConfig | undefined} oidcConfig
 * @returns {void}
 */
function setupAuthStrategies(server, oidcConfig) {
  // Cookie is a built-in authentication strategy for hapi.js that authenticates users based on a session cookie
  // Used for all non-Defra Identity routes
  // Lax policy required to allow redirection after Defra Identity sign out
  const cookieOptions = getCookieOptions()
  server.auth.strategy('session', 'cookie', cookieOptions)

  // Only register the defra-id strategy if oidcConfig is available
  if (oidcConfig) {
    // Bell is a third-party plugin that provides a common interface for OAuth 2.0 authentication
    // Used to authenticate users with Defra Identity and a pre-requisite for the Cookie authentication strategy
    // Also used for changing organisations and signing out
    const bellOptions = getBellOptions(oidcConfig)
    server.auth.strategy('defra-id', 'bell', bellOptions)
  }

  server.ext('onPostAuth', (/** @type {Request} */ request, /** @type {ResponseToolkit} */ h) =>
    mapPayloadToProfile(request, h)
  )
}

export default {
  plugin: {
    name: 'auth',
    register: async (/** @type {Server} */ server) => {
      log(LogCodes.SYSTEM.PLUGIN_REGISTRATION, {
        pluginName: 'auth',
        status: 'starting'
      })

      const oidcConfig = await setupOidcConfig()

      setupAuthStrategies(server, oidcConfig)

      log(LogCodes.SYSTEM.PLUGIN_REGISTRATION, {
        pluginName: 'auth',
        status: 'completed'
      })
    }
  }
}

/**
 * @param {BellCredentials} credentials
 * @returns {BellCredentials}
 */
function processCredentialsProfile(credentials) {
  const startTime = Date.now()
  try {
    logger.debug('Starting Bell credentials profile processing')
    validateCredentials(credentials)
    const payload = decodeTokenPayload(credentials.token)
    validatePayload(payload)
    const result = createCredentialsProfile(credentials, payload)
    logger.debug(`Completed Bell credentials profile processing ${Date.now() - startTime}ms`)
    return result
  } catch (error) {
    const authError = new AuthError({
      message: 'Bell profile processing failed',
      source: 'processCredentialsProfile',
      reason: 'bell_profile_processing_error',
      credentialsState: {
        received: !!credentials,
        hasToken: !!credentials?.token,
        tokenLength: credentials?.token?.length || 0
      }
    })
    authError.logCode = LogCodes.AUTH.SIGN_IN_FAILURE
    throw authError.from(/** @type {Error} */ (error))
  }
}

/**
 * @param {BellCredentials | undefined} credentials
 * @returns {void}
 */
function validateCredentials(credentials) {
  if (!credentials) {
    log(LogCodes.AUTH.CREDENTIALS_MISSING, {})
    throw new Error('No credentials received from Bell OAuth provider')
  }

  if (!credentials.token) {
    log(LogCodes.AUTH.TOKEN_MISSING, {})
    throw new Error('No token received from Defra Identity')
  }
}

/**
 * @param {string} token
 * @returns {JwtPayload}
 */
function decodeTokenPayload(token) {
  try {
    const decoded = Jwt.token.decode(token)
    const payload = decoded?.decoded?.payload

    if (!payload) {
      log(LogCodes.AUTH.SIGN_IN_FAILURE, {
        userId: 'unknown',
        errorMessage: 'JWT payload is empty or invalid',
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

    return /** @type {JwtPayload} */ (payload)
  } catch (jwtError) {
    const authError = new AuthError({
      message: 'JWT decode failed',
      source: 'decodeTokenPayload',
      reason: 'bell_profile_jwt_decode_error',
      jwtError: {
        tokenLength: token ? token.length : 0
      }
    })
    authError.logCode = LogCodes.AUTH.SIGN_IN_FAILURE
    throw authError.from(/** @type {Error} */ (jwtError))
  }
}

/**
 * @param {JwtPayload} payload
 * @returns {void}
 */
function validatePayload(payload) {
  const requiredFields = ['contactId', 'firstName', 'lastName']
  const missingFields = requiredFields.filter((/** @type {string} */ field) => !payload[field])

  if (missingFields.length > 0) {
    log(LogCodes.AUTH.SIGN_IN_FAILURE, {
      userId: payload.contactId || 'unknown',
      errorMessage: `Missing required JWT payload fields: ${missingFields.join(', ')}`,
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

/**
 * @param {BellCredentials} credentials
 * @param {JwtPayload} payload
 * @returns {BellCredentials}
 */
function createCredentialsProfile(credentials, payload) {
  const sessionId = crypto.randomUUID()

  credentials.profile = {
    ...payload,
    sessionId
  }
  return credentials
}

/**
 * @param {string | undefined} relationships
 * @returns {string[]}
 */
function extractFarmDetails(relationships) {
  const parts = relationships?.split(':') || []

  const LENGTH_OF_NORMAL_RELATIONSHIP_ENTRY = 6
  const LAST_INDEX_BEFORE_ORGANISATION_NAME = 2
  const INDEX_OF_LAST_KNOWN_PARTS_IN_COLLECTION = 3

  // Define indices for relationship parts
  const RELATIONSHIP_ID_INDEX = 0
  const SBI_INDEX = 1
  const ORGANISATION_LOA_INDEX = parts.length - INDEX_OF_LAST_KNOWN_PARTS_IN_COLLECTION
  const RELATIONSHIP_INDEX = parts.length - 2
  const RELATIONSHIP_LOA_INDEX = parts.length - 1

  if (parts.length < LENGTH_OF_NORMAL_RELATIONSHIP_ENTRY) {
    const reason = 'Invalid format: not enough fields'

    log(LogCodes.SYSTEM.RELATIONSHIP_PARSE_ERROR, {
      relationships,
      reason
    })

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
    parts[SBI_INDEX],
    orgName,
    parts[ORGANISATION_LOA_INDEX],
    parts[RELATIONSHIP_INDEX],
    parts[RELATIONSHIP_LOA_INDEX]
  ]
}

/**
 * @param {Request} request
 * @param {ResponseToolkit} h
 * @returns {symbol}
 */
export function mapPayloadToProfile(request, h) {
  if (request.auth.isAuthenticated && request.auth.credentials?.version !== AUTH_SESSION_VERSION) {
    const userData = /** @type {JwtPayload} */ (request.auth.credentials.profile || request.auth.credentials)

    request.auth.credentials = buildUserCredentials(userData, {
      ...request.auth.credentials,
      version: AUTH_SESSION_VERSION
    })
  }

  return h.continue
}

/**
 * @param {OidcConfig} oidcConfig
 */
function getBellOptions(oidcConfig) {
  return {
    provider: {
      name: 'defra-id',
      protocol: 'oauth2',
      useParamsAuth: true,
      auth: oidcConfig.authorization_endpoint,
      token: oidcConfig.token_endpoint,
      scope: ['openid', 'offline_access', config.get('defraId.clientId')],
      profile: function (/** @type {BellCredentials} */ credentials) {
        return processCredentialsProfile(credentials)
      }
    },
    password: config.get('session.cookie.password'),
    clientId: config.get('defraId.clientId'),
    clientSecret: config.get('defraId.clientSecret'),
    isSecure: config.get('session.cookie.secure'),
    location: function (/** @type {Request} */ request) {
      try {
        keepOnlySafeRedirect(request)
        return config.get('defraId.redirectUrl')
      } catch (error) {
        const authError = new AuthError({
          message: 'Bell location function failed',
          source: 'bell_location_function',
          reason: 'bell_location_function_error',
          locationError: {
            requestPath: request.path,
            requestMethod: request.method
          }
        })
        authError.logCode = LogCodes.AUTH.SIGN_IN_FAILURE
        throw authError.from(/** @type {Error} */ (error))
      }
    },
    providerParams: function (/** @type {Request | undefined} */ request) {
      const organisationId =
        typeof request?.query?.organisationId === 'string' ? request.query.organisationId : undefined

      return {
        serviceId: config.get('defraId.serviceId'),
        ...(organisationId && { organisationId })
      }
    }
  }
}

/**
 * @param {Request} request
 * @returns {void}
 */
function keepOnlySafeRedirect(request) {
  const redirect = request.query?.redirect
  if (redirect === undefined) {
    return
  }

  if (typeof redirect === 'string') {
    request.query.redirect = getSafeRedirect(redirect)
    return
  }

  debug(LogCodes.AUTH.SIGN_IN_FAILURE, {
    userId: 'unknown',
    errorMessage: `Ignored redirect parameter of type ${typeof redirect}`,
    step: 'bell_location_redirect_invalid'
  })
  delete request.query.redirect
}

/**
 * @param {UserSession | undefined} userSession
 * @param {string} sessionId
 * @param {Request} request
 * @returns {{ isValid: boolean }}
 */
function validateUserSession(userSession, sessionId, request) {
  if (!userSession) {
    log(
      LogCodes.AUTH.SESSION_EXPIRED,
      {
        userId: 'unknown',
        sessionId,
        path: request.path,
        reason: 'Session not found in cache'
      },
      request
    )
    return { isValid: false }
  }
  return { isValid: true }
}

/**
 * @param {UserSession} userSession
 * @param {string} sessionId
 * @param {Request} request
 * @returns {Promise<{ isValid: boolean }>}
 */
async function verifyAndRefreshToken(userSession, sessionId, request) {
  const startTime = Date.now()
  try {
    const decoded = Jwt.token.decode(userSession.token)
    Jwt.token.verifyTime(decoded)
    logger.debug(`Token verification succeeded ${Date.now() - startTime}ms`)
    return { isValid: true }
  } catch (tokenError) {
    return await handleTokenVerificationError(userSession, sessionId, request, /** @type {Error} */ (tokenError)) // NOSONAR - await is necessary here
  }
}

/**
 * @param {UserSession} userSession
 * @param {string} sessionId
 * @param {Request} request
 * @param {Error} tokenError
 * @returns {Promise<{ isValid: boolean }>}
 */
async function handleTokenVerificationError(userSession, sessionId, request, tokenError) {
  const startTime = Date.now()
  if (!config.get('defraId.refreshTokens')) {
    log(
      LogCodes.AUTH.SESSION_EXPIRED,
      {
        userId: userSession.contactId,
        sessionId,
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
      userSession.refreshToken,
      request
    )
    userSession.token = newToken
    userSession.refreshToken = newRefreshToken
    await request.server.app.cache.set(sessionId, userSession)
    log(
      LogCodes.AUTH.TOKEN_VERIFICATION_SUCCESS,
      {
        userId: userSession.contactId,
        organisationId: userSession.organisationId,
        step: 'token_refresh_success'
      },
      request
    )
    logger.debug(`Token refresh succeeded ${Date.now() - startTime}ms`)
    return { isValid: true }
  } catch (refreshError) {
    debug(
      LogCodes.AUTH.TOKEN_VERIFICATION_FAILURE,
      {
        message: `Token refresh failed ${Date.now() - startTime}ms`,
        userId: userSession.contactId,
        errorMessage: /** @type {Error} */ (refreshError).message,
        step: 'token_refresh_failed',
        originalTokenError: tokenError.message
      },
      request
    )
    return { isValid: false }
  }
}

// Routes where the cookie strategy must not attempt a token refresh (see validate).
const SIGN_OUT_PATHS = new Set(['/auth/sign-out', '/auth/sign-out-oidc'])

/**
 * @param {string} path
 * @returns {boolean}
 */
function isSignOutPath(path) {
  return SIGN_OUT_PATHS.has(path)
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
    redirectTo: '/auth/sign-in',
    appendNext: {
      name: 'redirect'
    },
    validate: async function (/** @type {Request} */ request, /** @type {{ sessionId: string }} */ session) {
      const userSessionBeforeUpgradeCheck = /** @type {UserSession | undefined} */ (
        await request.server.app.cache.get(session.sessionId)
      )

      const sessionValidation = validateUserSession(userSessionBeforeUpgradeCheck, session.sessionId, request)
      if (!sessionValidation.isValid) {
        return sessionValidation
      }

      const userSession = await upgradeUserSessionIfNeededCanBeRemovedADayAfterGoLive(
        /** @type {UserSession} */ (userSessionBeforeUpgradeCheck),
        session.sessionId,
        request
      )

      if (isSignOutPath(request.path)) {
        return { isValid: true, credentials: userSession }
      }

      if (/** @type {UserSession} */ (userSession).token) {
        const tokenValidation = await verifyAndRefreshToken(
          /** @type {UserSession} */ (userSession),
          session.sessionId,
          request
        )
        if (!tokenValidation.isValid) {
          return tokenValidation
        }
      }

      // Set the user's details on the request object and allow the request to continue
      // Depending on the service, additional checks can be performed here before returning `isValid: true`
      return { isValid: true, credentials: userSession }
    }
  }
}

/**
 * @param {JwtPayload} userData
 * @param {Record<string, unknown>} [existingCreds]
 * @returns {Record<string, unknown>}
 */
export function buildUserCredentials(userData, existingCreds = {}) {
  const currentRelationship = (userData?.relationships || []).find(
    (/** @type {string} */ relationship) => relationship.split(':')[0] === userData.currentRelationshipId
  )

  const [relationshipId, sbi, organisationName] = extractFarmDetails(currentRelationship)

  const fieldsToKeepFromProfile = Object.fromEntries(
    PROFILE_FIELDS_TO_KEEP_IN_SESSION_CACHE.filter((field) => userData[field] !== undefined).map((field) => [
      field,
      userData[field]
    ])
  )

  return {
    version: AUTH_SESSION_VERSION,
    ...existingCreds,
    ...fieldsToKeepFromProfile,
    sbi: String(sbi),
    crn: String(userData.contactId),
    name: `${userData.firstName} ${userData.lastName}`,
    organisationName,
    relationshipId: String(relationshipId)
  }
}

/**
 * @param {UserSession} userSession
 * @param {string} sessionId
 * @param {Request} request
 * @returns {Promise<UserSession>}
 */
async function upgradeUserSessionIfNeededCanBeRemovedADayAfterGoLive(userSession, sessionId, request) {
  if (!userSession) {
    return userSession
  }
  if (userSession?.version === AUTH_SESSION_VERSION) {
    return userSession
  }

  const upgradedSession = /** @type {UserSession} */ (
    buildUserCredentials(/** @type {JwtPayload} */ (userSession), {
      isAuthenticated: true,
      token: userSession.token,
      refreshToken: userSession.refreshToken
    })
  )

  await request.server.app.cache.set(sessionId, upgradedSession)

  log(
    LogCodes.AUTH.SESSION_UPGRADED,
    {
      step: 'auth_session_upgraded',
      userId: userSession.contactId,
      sessionId,
      fromVersion: userSession.version ?? 'unversioned',
      toVersion: AUTH_SESSION_VERSION,
      hasCrn: Boolean(upgradedSession.crn),
      hasSbi: Boolean(upgradedSession.sbi),
      hasRelationshipId: Boolean(upgradedSession.relationshipId)
    },
    request
  )

  return upgradedSession
}

export { getBellOptions, getCookieOptions }

/**
 * @import { Server, Request, ResponseToolkit } from '@hapi/hapi'
 */

/**
 * @typedef {object} OidcConfig
 * @property {string} authorization_endpoint
 * @property {string} token_endpoint
 * @property {string} [issuer]
 * @property {string} [userinfo_endpoint]
 * @property {string} [jwks_uri]
 * @property {string} [end_session_endpoint]
 * @property {string[]} [scopes_supported]
 * @property {string[]} [response_types_supported]
 * @property {string[]} [grant_types_supported]
 * @property {string[]} [token_endpoint_auth_methods_supported]
 */

/**
 * @typedef {{ contactId: string, firstName: string, lastName: string, currentRelationshipId?: string, relationships?: string[], [k: string]: unknown }} JwtPayload
 */

/**
 * @typedef {object} BellCredentials
 * @property {string} token
 * @property {JwtPayload & { sessionId: string }} [profile]
 */

/**
 * @typedef {object} UserSession
 * @property {number} [version]
 * @property {string} token
 * @property {string} refreshToken
 * @property {string} [contactId]
 * @property {string} [currentRelationshipId]
 * @property {string[]} [relationships]
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {string} [organisationId]
 * @property {string} [crn]
 * @property {string} [sbi]
 * @property {string} [name]
 * @property {string} [organisationName]
 * @property {string} [relationshipId]
 */
