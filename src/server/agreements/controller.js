import { config } from '~/src/config/config.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import Jwt from '@hapi/jwt'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

/**
 * Validates required configuration values
 * @throws {Error} If required config is missing
 */
function validateConfig() {
  const baseUrl = config.get('agreements.uiUrl')
  const token = config.get('agreements.uiToken')

  if (!baseUrl || !token) {
    throw new Error('Missing required configuration: agreements API settings')
  }

  return { baseUrl: String(baseUrl), token: String(token) }
}

/**
 * Constructs the target URI for the proxy request
 * @param {string} baseUrl - The base URL of the agreements API
 * @param {string} path - The path from the request params
 * @returns {string} The complete URI
 */
function buildTargetUri(baseUrl, path) {
  const cleanBaseUrl = baseUrl.replace(/\/$/, '')
  const cleanPath = path?.replace(/^\//, '') || ''
  const uri = cleanPath ? `${cleanBaseUrl}/${cleanPath}` : cleanBaseUrl
  return uri
}

/**
 * Builds proxy headers for the request
 *  - 'sbi' should be provided by the defra-id service
 *  - 'source' from grants-ui service will always be 'defra'
 * @param {string} token - The API token
 * @param {object} request - The incoming request object
 * @returns {object} The proxy headers object
 */
function buildProxyHeaders(token, request) {
  const sbi = request?.auth?.credentials?.sbi
  const source = 'defra'
  const jwtSecret = config.get('agreements.jwtSecret')
  try {
    const encryptedAuth = Jwt.token.generate({ sbi: sbi.toString(), source }, jwtSecret)
    return {
      Authorization: `Bearer ${token}`,
      'x-base-url': config.get('agreements.baseUrl'),
      'content-type': request.headers['content-type'] || 'application/x-www-form-urlencoded',
      'x-encrypted-auth': encryptedAuth,
      'x-csp-nonce': request.app.cspNonce
    }
  } catch (jwtError) {
    log(
      LogCodes.AGREEMENTS.AGREEMENT_ERROR,
      {
        userId: request.userId,
        error: `JWT generate failed: ${jwtError.message}`
      },
      request
    )
    throw jwtError
  }
}

/**
 * Controller for the agreements API
 * @satisfies {Partial<ServerRoute>}
 */
export const getAgreementController = {
  async handler(request, h) {
    try {
      const { baseUrl, token } = validateConfig()
      const { path } = request.params

      const uri = buildTargetUri(baseUrl, path)
      const headers = buildProxyHeaders(token, request)
      const apiResponse = await Promise.resolve(
        h.proxy({
          mapUri: () => ({ uri, headers }),
          passThrough: true,
          rejectUnauthorized: true
        })
      )

      if (!apiResponse) {
        request.logger.error('Proxy response is undefined. Possible upstream error or misconfiguration.')
        return h
          .response({
            error: 'No response from upstream service',
            message: 'The agreements API did not return any data'
          })
          .code(statusCodes.badGateway)
      }

      return apiResponse
    } catch (error) {
      request.logger.error('Request failed: %O', error)

      if (error.message.includes('Missing required configuration')) {
        return h
          .response({
            error: 'Service Configuration Error',
            message: 'Service temporarily unavailable'
          })
          .code(statusCodes.serviceUnavailable)
      }

      const statusCode = error.statusCode || error.output?.statusCode || statusCodes.serviceUnavailable

      return h
        .response({
          error: 'External Service Unavailable',
          message: 'Unable to process request',
          ...(process.env.NODE_ENV !== 'production' && {
            details: error.message
          })
        })
        .code(statusCode)
    }
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
