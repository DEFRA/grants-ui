import { hapiAuthOidcPlugin } from '@defra/hapi-auth-oidc'
import { unauthorized } from '@hapi/boom'
import { config } from '~/src/config/config.js'
import { log, LogCodes, logger } from '~/src/server/common/helpers/logging/log.js'
import { getSafeRedirect } from '~/src/server/auth/get-safe-redirect.js'
import { getEntraIdOidcOptions } from './entra-id-strategy.js'

const ENTRA_ID_REDIRECT_YAR_KEY = 'entraIdRedirect'
const ENTRA_ID_SESSION_COOKIE_NAME = 'entraIdSessionId'
const ENTRA_ID_CACHE_SEGMENT = 'entra-id-session'
const ENTRA_ID_LOGIN_PATH = '/login'

/**
 * Resolves where to send the user after sign-in, from the `Referer` of `GET /login`.
 *
 * @param {string | undefined} referer
 * @param {string} defaultPath
 * @param {string} loginCallbackUri
 * @returns {string}
 */
function getRefererAsRelativeUrl(referer, defaultPath, loginCallbackUri) {
  let relative = defaultPath
  if (referer) {
    try {
      const url = new URL(referer)
      relative = url.pathname + url.search
    } catch {
      relative = referer
    }
  }

  // Don't redirect back into the sign-in flow itself: the callback's payload can only be processed
  // once, and /login would bounce straight back to Azure in a loop.
  if (relative.startsWith(loginCallbackUri) || relative.startsWith(ENTRA_ID_LOGIN_PATH)) {
    relative = defaultPath
  }

  // `new URL(...).pathname` preserves a leading '//', so an attacker-hosted page at e.g.
  // https://evil.test//attacker.test/ produces '//attacker.test/', which browsers resolve as an
  // absolute external URL. getSafeRedirect rejects both '//' and '/\' prefixes (returning '/home').
  return getSafeRedirect(relative)
}

/**
 * @param {{ accessToken: string, refreshToken: string, expiresIn: number, claims: Record<string, unknown> }} credentials
 * @returns {{ id: unknown, displayName: unknown, email: unknown, isAuthenticated: true, accessToken: string, refreshToken: string, expiresIn: number }}
 */
function toSession({ accessToken, refreshToken, expiresIn, claims }) {
  return {
    id: claims?.oid,
    displayName: claims?.name,
    email: claims?.email ?? claims?.preferred_username,
    isAuthenticated: true,
    accessToken,
    refreshToken,
    expiresIn
  }
}

export default {
  plugin: {
    name: 'entra-id-auth',
    register: async (server) => {
      await server.register({
        plugin: hapiAuthOidcPlugin,
        options: getEntraIdOidcOptions()
      })

      const loginCallbackUri = config.get('entraId.loginCallbackUri')

      const sessionTtl = config.get('entraId.session.ttl')

      // `cache` must name the shared Redis cache provisioned in src/server/index.js. Omitting it
      // falls back to hapi's auto-provisioned `_default` in-memory cache, which is per-instance:
      // on CDP a session created on one container is invisible to the others, and every deploy
      // drops all sessions.
      const sessionCache = server.cache({
        cache: config.get('session.cache.name'),
        segment: ENTRA_ID_CACHE_SEGMENT,
        expiresIn: sessionTtl
      })

      server.auth.strategy('entra-id-session', 'cookie', {
        cookie: {
          name: ENTRA_ID_SESSION_COOKIE_NAME,
          path: '/',
          password: config.get('entraId.cookie.password'),
          isSecure: config.get('entraId.cookie.isSecure'),
          isSameSite: config.get('entraId.cookie.isSameSite'),
          ttl: sessionTtl,
          clearInvalid: true
        },
        keepAlive: true,
        // The 'cookie' scheme always decorates `request.cookieAuth` by default, which the app's
        // existing citizen-session strategy already claims - rename ours to avoid a decoration clash.
        requestDecoratorName: 'entraIdCookieAuth',
        validate: async (request, session) => {
          const sessionId = session?.sessionId
          if (!sessionId) {
            return { isValid: false }
          }

          const currentSession = await sessionCache.get(sessionId)
          if (!currentSession?.isAuthenticated) {
            return { isValid: false }
          }

          let refreshedSession
          let refreshError
          try {
            const { token, refreshed } = await request.ensureValidToken(currentSession)
            if (refreshed) {
              refreshedSession = toSession(token)
              await sessionCache.set(sessionId, refreshedSession)
            }
          } catch (error) {
            refreshError = error
          }

          // Logged outside the catch so the lint rule that bars log helpers inside
          // catch blocks is satisfied while still using structured log codes.
          if (refreshError) {
            await sessionCache.drop(sessionId)
            log(LogCodes.AUTH.ENTRA_ID_AUTH_FAILURE, {
              errorMessage: `Entra ID session refresh failed: ${refreshError.message}`,
              statusCode: 401,
              payload: null
            })
            return { isValid: false }
          }

          return {
            isValid: true,
            credentials: refreshedSession ?? currentSession
          }
        }
      })

      server.route({
        method: 'GET',
        path: ENTRA_ID_LOGIN_PATH,
        options: { auth: false },
        /**
         * @param {Request} request
         * @param {ResponseToolkit} h
         */
        handler: (request, h) => {
          const refererPath = getRefererAsRelativeUrl(request.info.referrer, '/', loginCallbackUri)
          request.yar.set(ENTRA_ID_REDIRECT_YAR_KEY, refererPath)
          return request.login(h)
        }
      })

      // Only a GET route: responseMode is hardcoded to 'query' above, so Azure always returns the
      // callback as a GET redirect, never a POST. Deliberately not registering POST here too - an
      // unauthenticated, crumb-exempt POST route with nothing left to protect it is worse than the
      // 404 Azure would get if it were ever misconfigured to form_post.
      server.route({
        method: 'GET',
        path: loginCallbackUri,
        options: { auth: false },
        handler: entraIdCallbackHandler(sessionCache)
      })
    }
  }
}

/**
 * @param {ReturnType<import('@hapi/hapi').Server['cache']>} sessionCache
 */
function entraIdCallbackHandler(sessionCache) {
  /**
   * @param {Request} request
   * @param {ResponseToolkit} h
   */
  return async (request, h) => {
    logger.info('*** ENTRA CALLBACK HANDLER HIT ***')
    logger.info(`query: ${JSON.stringify(request.query)}`)
    const credentials = await request.callback(h)
    logger.info(`*** CALLBACK COMPLETED *** credentials: ${!!credentials}`)

    if (!credentials) {
      throw unauthorized()
    }

    const sessionId = crypto.randomUUID()
    const session = toSession(credentials)
    await sessionCache.set(sessionId, session)

    request.entraIdCookieAuth.set({ sessionId })

    // Sanitised again on read (not just at write time in getRefererAsRelativeUrl), matching the
    // write-and-read-sanitise pattern used for the citizen `redirect` yar key elsewhere in the app.
    const storedRedirect = /** @type {string | null} */ (request.yar.get(ENTRA_ID_REDIRECT_YAR_KEY))
    const redirect = getSafeRedirect(storedRedirect ?? '/')
    request.yar.clear(ENTRA_ID_REDIRECT_YAR_KEY)
    return h.redirect(redirect)
  }
}

/**
 * @import { Request, ResponseToolkit } from '@hapi/hapi'
 */
