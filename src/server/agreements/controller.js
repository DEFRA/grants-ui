import { config } from '~/src/config/config.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { YarKeys } from '~/src/server/common/constants/session-keys.js'
import Jwt from '@hapi/jwt'
import { SystemError } from '~/src/server/common/utils/errors/SystemError.js'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'
import { logUpstreamError } from '~/src/server/common/helpers/logging/upstream-error.js'

/**
 * Validates required configuration values
 * @param {AnyRequest} request - The request object
 * @returns {{ baseUrl: string, token: string }} The validated config values
 * @throws {Error} If required config is missing
 */
function validateConfig(request) {
  const baseUrl = config.get('agreements.uiUrl')
  const token = config.get('agreements.uiToken')

  const missing = []
  if (!baseUrl) {
    missing.push('agreements.uiUrl')
  }
  if (!token) {
    missing.push('agreements.uiToken')
  }

  if (missing.length > 0) {
    log(LogCodes.SYSTEM.CONFIG_MISSING, { missing }, request)
    throw new Error(`Missing required configuration: ${missing.join(', ')}`)
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
 * @param {AnyRequest} request - The incoming request object
 * @returns {Record<string, string>} The proxy headers object
 */
function buildProxyHeaders(token, request) {
  const sbi = request?.auth?.credentials?.sbi
  const source = 'defra'
  const jwtSecret = config.get('agreements.jwtSecret')
  const grantApplicationContext = /** @type {{ grantCode?: string, clientRef?: string } | null} */ (
    request.yar?.get(YarKeys.GRANT_APPLICATION_CONTEXT)
  )
  try {
    const encryptedAuth = Jwt.token.generate(
      {
        sbi: /** @type {string | number} */ (sbi).toString(),
        grantCode: grantApplicationContext?.grantCode,
        clientRef: grantApplicationContext?.clientRef,
        source
      },
      jwtSecret
    )
    const contentTypeHeader = request.headers['content-type']
    const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader
    return {
      Authorization: `Bearer ${token}`,
      'x-base-url': /** @type {string} */ (config.get('agreements.baseUrl')),
      'content-type': contentType || 'application/x-www-form-urlencoded',
      'x-encrypted-auth': encryptedAuth,
      'x-csp-nonce': /** @type {string} */ (request.app.cspNonce)
    }
  } catch (jwtError) {
    const systemError = new SystemError({
      message: 'JWT generate failed',
      source: 'buildProxyHeaders',
      reason: 'jwt_generation_failure',
      userId: /** @type {{ userId?: string }} */ (request).userId
    })
    systemError.logCode = LogCodes.AGREEMENTS.AGREEMENT_ERROR
    throw systemError.from(/** @type {Error} */ (jwtError))
  }
}

/**
 * Logs an upstream error encountered while proxying to the agreements API.
 * @param {AnyRequest} request - The incoming request object
 * @param {ErrorResponse} error - The upstream error
 * @returns {void}
 */
function logAgreementsUpstreamError(request, error) {
  logUpstreamError(
    {
      endpoint: 'agreements',
      service: 'farming-grants-agreements-ui',
      upstreamStatus: error.statusCode ?? error.output?.statusCode ?? error.status ?? null,
      errorMessage: error.message
    },
    request
  )
}

/**
 * Controller for the agreements API
 * @satisfies {Partial<ServerRoute>}
 */
export const getAgreementController = {
  /**
   * @param {AnyRequest} request
   * @param {ResponseToolkit} h
   * @returns {Promise<unknown>}
   */
  async handler(request, h) {
    try {
      const { baseUrl, token } = validateConfig(request)
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
        log(LogCodes.AGREEMENTS.PROXY_RESPONSE_ERROR, {}, request)
        return h
          .response({
            error: 'No response from upstream service',
            message: 'The agreements API did not return any data'
          })
          .code(statusCodes.badGateway)
      }

      return apiResponse
    } catch (error) {
      logAgreementsUpstreamError(request, /** @type {ErrorResponse} */ (error))

      if (/** @type {Error} */ (error).message.includes('Missing required configuration')) {
        return h
          .response({
            error: 'Service Configuration Error',
            message: 'Service temporarily unavailable'
          })
          .code(statusCodes.serviceUnavailable)
      }

      const errResponse = /** @type {ErrorResponse} */ (error)
      const statusCode = errResponse.statusCode || errResponse.output?.statusCode || statusCodes.serviceUnavailable

      return h
        .response({
          error: 'External Service Unavailable',
          message: 'Unable to process request',
          ...(process.env.NODE_ENV !== 'production' && {
            details: /** @type {Error} */ (error).message
          })
        })
        .code(statusCode)
    }
  }
}

/**
 * @import { ServerRoute, ResponseToolkit } from '@hapi/hapi'
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */

/**
 * @typedef {Error & { statusCode?: number, status?: number, output?: { statusCode?: number } }} ErrorResponse
 */
