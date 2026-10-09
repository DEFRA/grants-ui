import { config } from '~/src/config/config.js'
import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import { YarKeys } from '~/src/server/common/constants/session-keys.js'
import { getReferenceNumber } from '~/src/server/common/helpers/state/get-cache-key-helper.js'
import { listApplicationsFromApi } from '~/src/server/common/helpers/state/fetch-saved-state-helper.js'
import Jwt from '@hapi/jwt'
import { notFound } from '@hapi/boom'
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
 * Reads the grant application context from the session, but only when it belongs
 * to the currently authenticated business. The context (grantCode/clientRef) is
 * written during a grant's post-submission redirect and is not re-derived per
 * request, so a stale entry left over from an earlier journey - or one for a
 * different SBI on a shared/dev account - would otherwise cause the agreements
 * service to resolve and render another business' agreement. Dropping the
 * mismatched context makes the upstream service reject the request instead.
 * @param {AnyRequest} request - The incoming request object
 * @param {string | number | undefined} authenticatedSbi - SBI from the authenticated credentials
 * @returns {Promise<{ grantCode?: string, clientRef?: string } | null>}
 */
async function resolveGrantApplicationContext(request, authenticatedSbi) {
  const storedContext = /** @type {{ grantCode?: string, clientRef?: string, sbi?: string | number } | null} */ (
    request.yar?.get(YarKeys.GRANT_APPLICATION_CONTEXT)
  )

  const urlContext = await resolveUrlContext(request, storedContext?.grantCode)
  if (urlContext) {
    return urlContext
  }

  if (!storedContext) {
    return null
  }

  const contextSbi = storedContext.sbi
  if (contextSbi != null && String(contextSbi) !== String(authenticatedSbi)) {
    log(
      LogCodes.AGREEMENTS.CONTEXT_SBI_MISMATCH,
      { contextSbi: String(contextSbi), authenticatedSbi: String(authenticatedSbi) },
      request
    )
    return null
  }

  return storedContext
}

/**
 * Multi-application tabs name their application on the URL (`?grant=&ref=`). The ref is accepted
 * only when it is one of this business's own applications, and is then stored as the session
 * context so the agreements requests that follow (which carry no query) act on the same one.
 * @param {AnyRequest} request
 * @param {string | undefined} storedGrantCode
 * @returns {Promise<{ grantCode: string, clientRef: string, sbi: unknown, applicationRef: string, grantVersion: string } | null>}
 */
async function resolveUrlContext(request, storedGrantCode) {
  const ref = getReferenceNumber(request)
  const grant = request.query?.grant
  const grantCode = typeof grant === 'string' && GRANT_CODE_PATTERN.test(grant) ? grant : storedGrantCode
  if (!ref || !grantCode) {
    return null
  }

  const { sbi, crn } = /** @type {{ sbi?: string | number, crn?: string | number }} */ (request.auth?.credentials ?? {})
  if (sbi == null || crn == null) {
    return null
  }

  // A list failure propagates: never fall back to the session's (possibly another tab's) application.
  const applications = await listApplicationsFromApi({ crn: String(crn), sbi: String(sbi), grantCode })

  const application = applications.find((candidate) => candidate.applicationRef === ref)
  if (!application) {
    throw notFound('Unknown application reference')
  }

  const context = {
    grantCode,
    grantVersion: application.grantVersion,
    clientRef: ref.toLowerCase(),
    sbi,
    applicationRef: ref
  }
  request.yar?.set(YarKeys.GRANT_APPLICATION_CONTEXT, context)
  return context
}

const GRANT_CODE_PATTERN = /^[a-z0-9-]+$/i

/**
 * Builds proxy headers for the request
 *  - 'sbi' should be provided by the defra-id service
 *  - 'source' from grants-ui service will always be 'defra'
 * @param {string} token - The API token
 * @param {AnyRequest} request - The incoming request object
 * @returns {Promise<Record<string, string>>} The proxy headers object
 */
async function buildProxyHeaders(token, request) {
  const sbi = request?.auth?.credentials?.sbi
  const crn = request?.auth?.credentials?.crn
  const sub = (typeof crn === 'string' && crn !== '') || typeof crn === 'number' ? String(crn) : undefined
  const source = 'defra'
  const jwtSecret = config.get('agreements.jwtSecret')
  const audience = /** @type {string[]} */ (config.get('agreements.jwtAudience'))
  const grantApplicationContext = await resolveGrantApplicationContext(
    request,
    /** @type {string | number | undefined} */ (sbi)
  )
  try {
    const userContext = Jwt.token.generate(
      {
        ...(sub === undefined ? {} : { sub }),
        iss: /** @type {string} */ (config.get('agreements.jwtIssuer')),
        aud: /** @type {string} */ (/** @type {unknown} */ (audience)),
        sbi: /** @type {string | number} */ (sbi).toString(),
        grantCode: grantApplicationContext?.grantCode,
        clientRef: grantApplicationContext?.clientRef,
        source
      },
      jwtSecret,
      { ttlSec: /** @type {number} */ (config.get('agreements.jwtTtlSec')) }
    )
    const contentTypeHeader = request.headers['content-type']
    const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader
    return {
      Authorization: `Bearer ${token}`,
      'x-base-url': /** @type {string} */ (config.get('agreements.baseUrl')),
      'content-type': contentType || 'application/x-www-form-urlencoded',
      'x-encrypted-auth': userContext, // TODO: https://eaflood.atlassian.net/browse/TGC-1596
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
      const headers = await buildProxyHeaders(token, request)
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
      // An unknown ?ref= is this service's own not-found, not an upstream failure: render the 404 page.
      if (/** @type {ErrorResponse} */ (error).output?.statusCode === statusCodes.notFound) {
        throw error
      }

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
