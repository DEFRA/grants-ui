import rateLimit from 'hapi-rate-limit'
import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

const TOO_MANY_REQUESTS = 429

/**
 * Extract client IP from X-Forwarded-For header
 * Takes the first IP in the chain (original client)
 * @param {string|undefined} xForwardedFor
 * @returns {string|null}
 */
export const getClientIp = (xForwardedFor) => {
  if (!xForwardedFor) {
    return null
  }
  return xForwardedFor.split(',')[0].trim()
}

/**
 * Log when rate limit is exceeded
 * @param {Request} request
 */
function logRateLimitExceeded(request) {
  const ip = getClientIp(request.headers['x-forwarded-for']) || request.info.remoteAddress
  log(
    LogCodes.SYSTEM.RATE_LIMIT_EXCEEDED,
    {
      path: request.path,
      ip,
      userId: request.auth?.credentials?.contactId,
      userAgent: request.headers['user-agent']
    },
    request
  )
}

/**
 * Rate limiting plugin configuration
 * Addresses CWE-400 (Uncontrolled Resource Consumption) vulnerability
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const rateLimitPlugin = {
  plugin: {
    name: 'rate-limit',
    async register(server) {
      if (!config.get('rateLimit.enabled')) {
        return
      }

      const cacheTtl = config.get('rateLimit.userLimitPeriod')

      await server.register({
        plugin: rateLimit,
        options: {
          enabled: true,
          userAttribute: 'sessionId',
          addressOnly: false,
          trustProxy: config.get('rateLimit.trustProxy'),
          getIpFromProxyHeader: getClientIp,
          proxyHeaderName: 'x-forwarded-for',
          userLimit: config.get('rateLimit.userLimit'),
          pathLimit: config.get('rateLimit.pathLimit'),
          authLimit: config.get('rateLimit.authLimit'),
          userCache: {
            segment: 'rate-limit-user',
            expiresIn: cacheTtl
          },
          pathCache: {
            segment: 'rate-limit-path',
            expiresIn: cacheTtl
          },
          authCache: {
            segment: 'rate-limit-auth',
            expiresIn: cacheTtl
          },
          headers: true
        }
      })

      server.ext('onPreResponse', (request, h) => {
        const response = request.response
        if ('isBoom' in response && response.isBoom && response.output.statusCode === TOO_MANY_REQUESTS) {
          logRateLimitExceeded(request)
        }
        return h.continue
      })
    }
  }
}

/**
 * @import { ServerRegisterPluginObject, Request } from '@hapi/hapi'
 */
