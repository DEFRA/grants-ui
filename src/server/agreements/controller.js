import { config } from '~/src/config/config.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'

/**
 * Validates required configuration values
 * @throws {Error} If required config is missing
 */
function validateConfig() {
  const baseUrl = config.get('agreements.agreementsApiUrl')
  const token = config.get('agreements.agreementsApiToken')

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
 * @param {string} token - The API token
 * @param {object} requestHeaders - The incoming request headers
 * @param {string} method - The HTTP method
 * @returns {object} The proxy headers object
 */
function buildProxyHeaders(token, requestHeaders) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'defra-grants-proxy': 'true',
    'content-type': requestHeaders['content-type'] || 'application/x-www-form-urlencoded'
  }

  return headers
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

      if (!path) {
        return h
          .response({
            error: 'Bad Request',
            message: 'Path parameter is required'
          })
          .code(statusCodes.badRequest)
      }

      const uri = buildTargetUri(baseUrl, path)
      const headers = buildProxyHeaders(token, request.headers)

      const apiResponse = await Promise.resolve(
        h.proxy({
          mapUri: () => ({ uri, headers }),
          passThrough: true,
          rejectUnauthorized: false,
          onResponse: (err, res, req, h) => {
            if (err) {
              request.logger.error('Proxy error:', err)
              return h.response('Proxy error').code(502)
            }

            return h.response(res).code(res.statusCode)
          }
        })
      )

      if (!apiResponse) {
        request.logger.error('Proxy response is undefined. Possible upstream error or misconfiguration.')
        return h
          .response({
            error: 'No response from upstream service',
            message: 'The agreements API did not return any data'
          })
          .code(502)
      }

      request.logger.info({
        message: 'Agreements API request successful',
        method: request.method,
        response: apiResponse
      })
      return apiResponse
    } catch (error) {
      request.logger.error('Request failed:', error)

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
