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

      // Debug log all Defra ID configuration values
      log(LogCodes.AUTH.AUTH_DEBUG, {
        path: 'auth_plugin_registration',
        isAuthenticated: 'system',
        strategy: 'system',
        mode: 'config_debug',
        hasCredentials: 'system_level',
        hasToken: 'system_level',
        hasProfile: 'system_level',
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

      // Log critical environment variables for debugging
      log(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
        configType: 'DefraID_Environment_Variables',
        configValues: {
          DEFRA_ID_WELL_KNOWN_URL:
            process.env.DEFRA_ID_WELL_KNOWN_URL ?? 'NOT_SET',
          DEFRA_ID_CLIENT_ID: process.env.DEFRA_ID_CLIENT_ID ?? 'NOT_SET',
          DEFRA_ID_CLIENT_SECRET: process.env.DEFRA_ID_CLIENT_SECRET
            ? '[REDACTED]'
            : 'NOT_SET',
          DEFRA_ID_SERVICE_ID: process.env.DEFRA_ID_SERVICE_ID ?? 'NOT_SET',
          DEFRA_ID_REDIRECT_URL: process.env.DEFRA_ID_REDIRECT_URL ?? 'NOT_SET',
          DEFRA_ID_SIGN_OUT_REDIRECT_URL:
            process.env.DEFRA_ID_SIGN_OUT_REDIRECT_URL ?? 'NOT_SET',
          DEFRA_ID_REFRESH_TOKENS:
            process.env.DEFRA_ID_REFRESH_TOKENS ?? 'NOT_SET',
          NODE_ENV: process.env.NODE_ENV ?? 'NOT_SET'
        }
      })

      // Log session configuration that affects authentication
      log(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
        configType: 'Session_Configuration',
        configValues: {
          SESSION_CACHE_ENGINE: process.env.SESSION_CACHE_ENGINE ?? 'NOT_SET',
          REDIS_HOST: process.env.REDIS_HOST ?? 'NOT_SET',
          REDIS_PORT: process.env.REDIS_PORT ?? 'NOT_SET',
          REDIS_PASSWORD: process.env.REDIS_PASSWORD ? '[REDACTED]' : 'NOT_SET',
          SESSION_COOKIE_PASSWORD: process.env.SESSION_COOKIE_PASSWORD
            ? '[REDACTED]'
            : 'NOT_SET',
          SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE ?? 'NOT_SET'
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

        // Log full OIDC configuration from well-known endpoint
        log(LogCodes.SYSTEM.ENV_CONFIG_DEBUG, {
          configType: 'OIDC_WellKnown_Response',
          configValues: {
            issuer: oidcConfig.issuer ?? 'NOT_SET',
            authorization_endpoint:
              oidcConfig.authorization_endpoint ?? 'NOT_SET',
            token_endpoint: oidcConfig.token_endpoint ?? 'NOT_SET',
            userinfo_endpoint: oidcConfig.userinfo_endpoint ?? 'NOT_SET',
            jwks_uri: oidcConfig.jwks_uri ?? 'NOT_SET',
            end_session_endpoint: oidcConfig.end_session_endpoint ?? 'NOT_SET',
            scopes_supported: oidcConfig.scopes_supported ?? 'NOT_SET',
            response_types_supported:
              oidcConfig.response_types_supported ?? 'NOT_SET',
            grant_types_supported:
              oidcConfig.grant_types_supported ?? 'NOT_SET',
            token_endpoint_auth_methods_supported:
              oidcConfig.token_endpoint_auth_methods_supported ?? 'NOT_SET'
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

      log(LogCodes.AUTH.AUTH_DEBUG, {
        path: 'auth_strategy_registration',
        isAuthenticated: 'system',
        strategy: 'bell',
        mode: 'strategy_registration',
        hasCredentials: 'system_level',
        hasToken: 'system_level',
        hasProfile: 'system_level',
        userAgent: 'server',
        referer: 'none',
        queryParams: {},
        authError: 'none',
        strategyName: 'defra-id',
        timestamp: new Date().toISOString()
      })

      // Bell is a third-party plugin that provides a common interface for OAuth 2.0 authentication
      // Used to authenticate users with Defra Identity and a pre-requisite for the Cookie authentication strategy
      // Also used for changing organisations and signing out
      const bellOptions = getBellOptions(oidcConfig)
      server.auth.strategy('defra-id', 'bell', bellOptions)

      log(LogCodes.AUTH.AUTH_DEBUG, {
        path: 'auth_strategy_registration',
        isAuthenticated: 'system',
        strategy: 'bell',
        mode: 'strategy_registered',
        hasCredentials: 'system_level',
        hasToken: 'system_level',
        hasProfile: 'system_level',
        userAgent: 'server',
        referer: 'none',
        queryParams: {},
        authError: 'none',
        strategyName: 'defra-id',
        timestamp: new Date().toISOString()
      })

      log(LogCodes.AUTH.AUTH_DEBUG, {
        path: 'cookie_strategy_registration',
        isAuthenticated: 'system',
        strategy: 'cookie',
        mode: 'strategy_registration',
        hasCredentials: 'system_level',
        hasToken: 'system_level',
        hasProfile: 'system_level',
        userAgent: 'server',
        referer: 'none',
        queryParams: {},
        authError: 'none',
        strategyName: 'session',
        timestamp: new Date().toISOString()
      })

      // Cookie is a built-in authentication strategy for hapi.js that authenticates users based on a session cookie
      // Used for all non-Defra Identity routes
      // Lax policy required to allow redirection after Defra Identity sign out
      const cookieOptions = getCookieOptions()
      server.auth.strategy('session', 'cookie', cookieOptions)

      log(LogCodes.AUTH.AUTH_DEBUG, {
        path: 'cookie_strategy_registration',
        isAuthenticated: 'system',
        strategy: 'cookie',
        mode: 'strategy_registered',
        hasCredentials: 'system_level',
        hasToken: 'system_level',
        hasProfile: 'system_level',
        userAgent: 'server',
        referer: 'none',
        queryParams: {},
        authError: 'none',
        strategyName: 'session',
        cookieConfig: {
          isSecure: cookieOptions.cookie.isSecure,
          path: cookieOptions.cookie.path,
          isSameSite: cookieOptions.cookie.isSameSite,
          hasPassword: !!cookieOptions.cookie.password
        },
        timestamp: new Date().toISOString()
      })

      // Set the default authentication strategy to session
      // All routes will require authentication unless explicitly set to 'defra-id' or `auth: false`
      server.auth.default('session')

      log(LogCodes.AUTH.AUTH_DEBUG, {
        path: 'default_auth_strategy',
        isAuthenticated: 'system',
        strategy: 'session',
        mode: 'default_strategy_set',
        hasCredentials: 'system_level',
        hasToken: 'system_level',
        hasProfile: 'system_level',
        userAgent: 'server',
        referer: 'none',
        queryParams: {},
        authError: 'none',
        defaultStrategy: 'session',
        timestamp: new Date().toISOString()
      })

      // Add auth debugging hook to log initial authentication attempts
      server.ext('onPreAuth', (request, h) => {
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

      log(LogCodes.SYSTEM.PLUGIN_REGISTRATION, {
        pluginName: 'auth',
        status: 'completed'
      })
    }
  }
}

function getBellOptions(oidcConfig) {
  // Debug log Bell configuration before creating provider
  log(LogCodes.AUTH.AUTH_DEBUG, {
    path: 'bell_configuration',
    isAuthenticated: 'system',
    strategy: 'bell',
    mode: 'provider_setup',
    hasCredentials: false,
    hasToken: false,
    hasProfile: false,
    userAgent: 'server',
    referer: 'none',
    queryParams: {},
    authError: 'none',
    bellConfig: {
      useParamsAuth: true,
      authEndpoint: oidcConfig.authorization_endpoint,
      tokenEndpoint: oidcConfig.token_endpoint,
      scope: ['openid', 'offline_access', config.get('defraId.clientId')],
      clientIdLength: config.get('defraId.clientId')
        ? config.get('defraId.clientId').length
        : 0,
      hasClientSecret: !!config.get('defraId.clientSecret'),
      redirectUrl: config.get('defraId.redirectUrl'),
      isSecure: config.get('session.cookie.secure'),
      cookiePassword: config.get('session.cookie.password')
        ? '[REDACTED]'
        : 'NOT_SET'
    },
    timestamp: new Date().toISOString()
  })

  const bellOptions = {
    provider: {
      name: 'defra-id',
      protocol: 'oauth2',
      useParamsAuth: true,
      auth: oidcConfig.authorization_endpoint,
      token: oidcConfig.token_endpoint,
      scope: ['openid', 'offline_access', config.get('defraId.clientId')],
      profile: function (credentials) {
        try {
          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: 'bell_profile_processing',
            isAuthenticated: 'processing',
            strategy: 'bell',
            mode: 'profile_start',
            hasCredentials: !!credentials,
            hasToken: !!credentials?.token,
            hasProfile: 'pending',
            userAgent: 'server',
            referer: 'none',
            queryParams: {},
            authError: 'none',
            credentialsReceived: !!credentials,
            timestamp: new Date().toISOString()
          })

          if (credentials) {
            log(LogCodes.AUTH.AUTH_DEBUG, {
              path: 'bell_profile_processing',
              isAuthenticated: 'processing',
              strategy: 'bell',
              mode: 'credentials_analysis',
              hasCredentials: true,
              hasToken: !!credentials.token,
              hasProfile: 'not_created_yet',
              userAgent: 'server',
              referer: 'none',
              queryParams: {},
              authError: 'none',
              credentialsKeys: Object.keys(credentials),
              tokenExists: !!credentials.token,
              tokenType: credentials.token
                ? typeof credentials.token
                : 'undefined',
              tokenLength: credentials.token ? credentials.token.length : 0,
              refreshTokenExists: !!credentials.refresh_token,
              queryExists: !!credentials.query,
              profileExists: !!credentials.profile,
              timestamp: new Date().toISOString()
            })
          } else {
            log(LogCodes.AUTH.SIGN_IN_FAILURE, {
              userId: 'unknown',
              error: 'No credentials object received from Bell',
              step: 'bell_profile_no_credentials',
              credentialsState: 'null_or_undefined'
            })
            throw new Error('No credentials received from Bell OAuth provider')
          }

          if (!credentials.token) {
            log(LogCodes.AUTH.SIGN_IN_FAILURE, {
              userId: 'unknown',
              error: 'No access token received from Defra Identity',
              step: 'bell_profile_no_token',
              credentialsAnalysis: {
                hasCredentials: !!credentials,
                credentialsKeys: Object.keys(credentials || {}),
                tokenProperty: credentials.token,
                refreshTokenProperty: credentials.refresh_token
              }
            })
            throw new Error('No token received from Defra Identity')
          }

          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: 'bell_profile_processing',
            isAuthenticated: 'processing',
            strategy: 'bell',
            mode: 'jwt_decode_attempt',
            hasCredentials: true,
            hasToken: true,
            hasProfile: 'processing_token',
            userAgent: 'server',
            referer: 'none',
            queryParams: {},
            authError: 'none',
            tokenLength: credentials.token.length,
            tokenPrefix: credentials.token.substring(0, 20) + '...',
            timestamp: new Date().toISOString()
          })

          let decoded, payload
          try {
            decoded = Jwt.token.decode(credentials.token)
            payload = decoded?.decoded?.payload
          } catch (jwtError) {
            log(LogCodes.AUTH.SIGN_IN_FAILURE, {
              userId: 'unknown',
              error: `JWT decode failed: ${jwtError.message}`,
              step: 'bell_profile_jwt_decode_error',
              jwtError: {
                message: jwtError.message,
                stack: jwtError.stack,
                tokenLength: credentials.token ? credentials.token.length : 0
              }
            })
            throw new Error(`Failed to decode JWT token: ${jwtError.message}`)
          }

          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: 'bell_profile_processing',
            isAuthenticated: 'processing',
            strategy: 'bell',
            mode: 'jwt_decode_success',
            hasCredentials: true,
            hasToken: true,
            hasProfile: payload ? 'payload_extracted' : 'payload_missing',
            userAgent: 'server',
            referer: 'none',
            queryParams: {},
            authError: 'none',
            decodedStructure: {
              hasDecoded: !!decoded,
              hasDecodedDecoded: !!decoded?.decoded,
              hasPayload: !!payload,
              payloadType: typeof payload
            },
            timestamp: new Date().toISOString()
          })

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

          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: 'bell_profile_processing',
            isAuthenticated: 'processing',
            strategy: 'bell',
            mode: 'payload_analysis',
            hasCredentials: true,
            hasToken: true,
            hasProfile: 'validating_payload',
            userAgent: 'server',
            referer: 'none',
            queryParams: {},
            authError: 'none',
            payloadKeys: Object.keys(payload),
            hasContactId: !!payload.contactId,
            hasFirstName: !!payload.firstName,
            hasLastName: !!payload.lastName,
            hasCurrentRelationshipId: !!payload.currentRelationshipId,
            hasEmail: !!payload.email,
            payloadSize: JSON.stringify(payload).length,
            timestamp: new Date().toISOString()
          })

          const requiredFields = ['contactId', 'firstName', 'lastName']
          const missingFields = requiredFields.filter(
            (field) => !payload[field]
          )

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
            throw new Error(
              `Missing required fields in JWT payload: ${missingFields.join(', ')}`
            )
          }

          const sessionId = crypto.randomUUID()
          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: 'bell_profile_processing',
            isAuthenticated: 'processing',
            strategy: 'bell',
            mode: 'session_id_generation',
            hasCredentials: true,
            hasToken: true,
            hasProfile: 'creating_profile',
            userAgent: 'server',
            referer: 'none',
            queryParams: {},
            authError: 'none',
            sessionIdGenerated: !!sessionId,
            sessionIdLength: sessionId.length,
            timestamp: new Date().toISOString()
          })

          credentials.profile = {
            ...payload,
            crn: payload.contactId,
            name: `${payload.firstName} ${payload.lastName}`,
            organisationId: payload.currentRelationshipId,
            sessionId
          }

          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: 'bell_profile_processing',
            isAuthenticated: 'processing',
            strategy: 'bell',
            mode: 'profile_mapped_success',
            hasCredentials: true,
            hasToken: true,
            hasProfile: true,
            userAgent: 'server',
            referer: 'none',
            queryParams: {},
            authError: 'none',
            profileCreated: {
              name: credentials.profile.name,
              contactId: credentials.profile.contactId,
              crn: credentials.profile.crn,
              organisationId: credentials.profile.organisationId,
              sessionId: credentials.profile.sessionId,
              email: credentials.profile.email,
              profileKeys: Object.keys(credentials.profile)
            },
            timestamp: new Date().toISOString()
          })

          log(LogCodes.AUTH.AUTH_DEBUG, {
            path: 'bell_profile_processing',
            isAuthenticated: 'processing',
            strategy: 'bell',
            mode: 'profile_complete',
            hasCredentials: true,
            hasToken: true,
            hasProfile: true,
            userAgent: 'server',
            referer: 'none',
            queryParams: {},
            authError: 'none',
            finalCredentials: {
              hasToken: !!credentials.token,
              hasRefreshToken: !!credentials.refresh_token,
              hasProfile: !!credentials.profile,
              profileSessionId: credentials.profile?.sessionId,
              profileName: credentials.profile?.name
            },
            timestamp: new Date().toISOString()
          })

          return credentials
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
    },
    password: config.get('session.cookie.password'),
    clientId: config.get('defraId.clientId'),
    clientSecret: config.get('defraId.clientSecret'),
    isSecure: config.get('session.cookie.secure'),
    location: function (request) {
      try {
        log(LogCodes.AUTH.AUTH_DEBUG, {
          path: request.path,
          isAuthenticated: 'processing',
          strategy: 'bell',
          mode: 'location_function_start',
          hasCredentials: 'not_applicable',
          hasToken: 'not_applicable',
          hasProfile: 'not_applicable',
          userAgent: request.headers?.['user-agent'] || 'unknown',
          referer: request.headers?.referer || 'none',
          queryParams: request.query,
          authError: 'none',
          locationFunctionCalled: true,
          timestamp: new Date().toISOString()
        })

        log(LogCodes.AUTH.AUTH_DEBUG, {
          path: request.path,
          isAuthenticated: 'processing',
          strategy: 'bell',
          mode: 'location_request_analysis',
          hasCredentials: 'not_applicable',
          hasToken: 'not_applicable',
          hasProfile: 'not_applicable',
          userAgent: request.headers?.['user-agent'] || 'unknown',
          referer: request.headers?.referer || 'none',
          queryParams: request.query,
          authError: 'none',
          requestAnalysis: {
            method: request.method,
            url: request.url.href,
            hasState: !!request.state,
            cookieCount: Object.keys(request.state || {}).length,
            cookieNames: Object.keys(request.state || {}),
            hasSessionStore: !!request.yar,
            headers: {
              host: request.headers.host,
              origin: request.headers.origin,
              cookie: request.headers.cookie ? '[REDACTED]' : 'none'
            }
          },
          timestamp: new Date().toISOString()
        })

        const redirectParam = request.query.redirect
        log(LogCodes.AUTH.AUTH_DEBUG, {
          path: request.path,
          isAuthenticated: 'processing',
          strategy: 'bell',
          mode: 'location_redirect_handling',
          hasCredentials: 'not_applicable',
          hasToken: 'not_applicable',
          hasProfile: 'not_applicable',
          userAgent: request.headers?.['user-agent'] || 'unknown',
          referer: request.headers?.referer || 'none',
          queryParams: request.query,
          authError: 'none',
          redirectHandling: {
            hasRedirectParam: !!redirectParam,
            redirectParam,
            configuredRedirectUrl: config.get('defraId.redirectUrl')
          },
          timestamp: new Date().toISOString()
        })

        if (redirectParam) {
          try {
            const safeRedirect = getSafeRedirect(redirectParam)
            request.yar.set('redirect', safeRedirect)

            log(LogCodes.AUTH.AUTH_DEBUG, {
              path: request.path,
              isAuthenticated: 'processing',
              strategy: 'bell',
              mode: 'location_redirect_stored',
              hasCredentials: 'not_applicable',
              hasToken: 'not_applicable',
              hasProfile: 'not_applicable',
              userAgent: request.headers?.['user-agent'] || 'unknown',
              referer: request.headers?.referer || 'none',
              queryParams: request.query,
              authError: 'none',
              redirectStorage: {
                originalRedirect: redirectParam,
                safeRedirect,
                storedInSession: true
              },
              timestamp: new Date().toISOString()
            })
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

        const finalRedirectUrl = config.get('defraId.redirectUrl')

        log(LogCodes.AUTH.AUTH_DEBUG, {
          path: request.path,
          isAuthenticated: 'processing',
          strategy: 'bell',
          mode: 'location_function_complete',
          hasCredentials: 'not_applicable',
          hasToken: 'not_applicable',
          hasProfile: 'not_applicable',
          userAgent: request.headers?.['user-agent'] || 'unknown',
          referer: request.headers?.referer || 'none',
          queryParams: request.query,
          authError: 'none',
          locationResult: {
            finalRedirectUrl,
            urlLength: finalRedirectUrl ? finalRedirectUrl.length : 0,
            urlValid: !!finalRedirectUrl
          },
          timestamp: new Date().toISOString()
        })

        return finalRedirectUrl
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

        log(LogCodes.AUTH.AUTH_DEBUG, {
          path: request.path,
          isAuthenticated: 'processing',
          strategy: 'bell',
          mode: 'provider_params',
          hasCredentials: false,
          hasToken: false,
          hasProfile: false,
          userAgent: request.headers?.['user-agent'] || 'unknown',
          referer: request.headers?.referer || 'none',
          queryParams: request.query,
          authError: 'none',
          providerParams: params,
          serviceId: config.get('defraId.serviceId'),
          timestamp: new Date().toISOString()
        })

        return params
      } catch (error) {
        log(LogCodes.AUTH.SIGN_IN_FAILURE, {
          userId: 'unknown',
          error: `Bell provider params function failed: ${error.message}`,
          step: 'bell_provider_params_error'
        })

        error.alreadyLogged = true
        throw error
      }
    }
  }

  // Log the final Bell options for debugging
  log(LogCodes.AUTH.AUTH_DEBUG, {
    path: 'bell_final_options',
    isAuthenticated: 'system',
    strategy: 'bell',
    mode: 'final_options',
    hasCredentials: false,
    hasToken: false,
    hasProfile: false,
    userAgent: 'server',
    referer: 'none',
    queryParams: {},
    authError: 'none',
    finalOptions: {
      isSecure: bellOptions.isSecure,
      hasPassword: !!bellOptions.password,
      hasClientId: !!bellOptions.clientId,
      hasClientSecret: !!bellOptions.clientSecret
    },
    timestamp: new Date().toISOString()
  })

  return bellOptions
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
