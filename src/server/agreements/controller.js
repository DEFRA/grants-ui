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
  /* eslint-disable-next-line no-console */
  console.log('agreements API base URL:', String(baseUrl))

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
  /* eslint-disable-next-line no-console */
  console.log('Target URI:', uri)
  return uri
}

/**
 * Builds proxy headers for the request
 * @param {string} token - The API token
 * @param {object} requestHeaders - The incoming request headers
 * @param {string} method - The HTTP method
 * @returns {object} The proxy headers object
 */
function buildProxyHeaders(token, requestHeaders, method) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'defra-grants-proxy': 'true',
    ...requestHeaders
  }

  if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    headers['content-type'] =
      requestHeaders['content-type'] || 'application/x-www-form-urlencoded'
  }

  return headers
}

/**
 * Controller for the agreements API
 * @param {object} request - The incoming request
 * @param {object} h - The Hapi response toolkit
 * @returns {Promise<object>} The response from the proxy
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

      const targetUri = buildTargetUri(baseUrl, path)
      const proxyHeaders = buildProxyHeaders(
        token,
        request.headers,
        request.method
      )

      /* eslint-disable-next-line no-console */
      console.log('Proxying request to agreements API', token)

      const apiResponse = await h.proxy({
        mapUri: () => ({ uri: targetUri, headers: proxyHeaders }),
        passThrough: true
      })

      /* eslint-disable-next-line no-console */
      console.log('Agreements Request completed', apiResponse)
      return apiResponse
    } catch (error) {
      /* eslint-disable-next-line no-console */
      console.log('Request failed:', error)

      if (error.message.includes('Missing required configuration')) {
        return h
          .response({
            error: 'Service Configuration Error',
            message: 'Service temporarily unavailable'
          })
          .code(statusCodes.serviceUnavailable)
      }

      const statusCode =
        error.statusCode ||
        error.output?.statusCode ||
        statusCodes.serviceUnavailable

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
