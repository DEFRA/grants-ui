import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { getScoringServiceToken } from '~/src/server/common/helpers/auth/scoring-service-token.js'
import { withTraceId } from '@defra/hapi-tracing'

const SCORING_SERVICE_URL = config.get('scoring.serviceUrl')

/**
 * Invokes a GET action on the Grant Scoring Service
 * @param {string} grantCode - Grant code
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
 * @param {Record<string, unknown>} [queryParams] - Optional query parameters
 * @returns {Promise<any>} - Promise that resolves to the response JSON
 * @throws {GrantScoringServiceApiError} - If the API request fails
 */
export async function invokeGrantScoringGetAction(grantCode, request, queryParams = {}) {
  const url = `${SCORING_SERVICE_URL}/scoring/${grantCode}`
  const response = await makeScoringApiRequest(url, grantCode, request, {
    method: 'GET',
    queryParams
  })
  return response.json()
}

/**
 * Custom error type thrown when Scoring API requests fail.
 */
class GrantScoringServiceApiError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {number} statusCode - HTTP status code returned by Scoring Service
   * @param {string} responseBody - Error response body from Scoring Service
   * @param {string} code - Grant code for context
   * @param {Error} [cause] - Optional underlying error
   */
  constructor(message, statusCode, responseBody, code, cause) {
    super(message, cause ? { cause } : undefined)
    this.name = 'GrantScoringServiceApiError'
    this.status = statusCode
    this.responseBody = responseBody
    this.grantCode = code
  }
}

/**
 * Builds HTTP request options for Scoring API calls.
 *
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @returns {Promise<RequestInit>} Fetch-compatible request options
 * @private
 */
async function buildRequestOptions(method) {
  const authToken = await getScoringServiceToken()

  /** @type {RequestInit} */
  return {
    method,
    headers: withTraceId(config.get('tracing.header'), {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    })
  }
}

/**
 * Builds a full request URL including query parameters (if provided).
 *
 * @param {string} url - Base API URL
 * @param {Record<string, unknown>} [queryParams] - Optional query parameters
 * @returns {string} Fully constructed URL
 * @private
 */
function buildRequestUrl(url, queryParams) {
  if (!queryParams) {
    return url
  }

  const searchParams = new URLSearchParams()

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value.toString())
    }
  })

  const query = searchParams.toString()
  return query ? `${url}?${query}` : url
}

/**
 * Validates the HTTP response and throws a typed error if the request failed.
 *
 * @param {Response} response - Fetch response object
 * @param {string} grantCode - Grant code for error context
 * @returns {Promise<Response>} The original response if successful
 * @throws {GrantScoringServiceApiError}
 * @private
 */
async function handleResponse(response, grantCode) {
  if (!response.ok) {
    const error = await response.json()

    throw new GrantScoringServiceApiError(
      `${response.status} ${response.statusText} - ${error.message}`,
      response.status,
      error.message,
      grantCode
    )
  }

  return response
}

/**
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
 * @param {string} url
 * @param {unknown} error
 */
function logScoringUpstreamError(request, url, error) {
  const upstream = /** @type {{ status?: number, message?: string }} */ (error)
  log(
    LogCodes.SYSTEM.EXTERNAL_API_ERROR,
    {
      endpoint: url,
      service: 'grant-scoring-service',
      upstreamStatus: upstream.status ?? null,
      errorMessage: upstream.message
    },
    request
  )
}

/**
 * Makes a request to the Grant Scoring Service API
 * @param {string} url - API endpoint URL
 * @param {string} grantCode - Grant code for error context
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
 * @param {object} [options] - Request options
 * @param {string} [options.method] - HTTP method (GET, POST, etc.)
 * @param {Record<string, unknown>} [options.queryParams] - Query parameters for GET requests
 * @returns {Promise<Response>} - Promise that resolves to the response
 * @throws {GrantScoringServiceApiError} - If the API request fails
 */
export async function makeScoringApiRequest(url, grantCode, request, options = {}) {
  const { method = 'GET', queryParams } = options

  try {
    const requestUrl = buildRequestUrl(url, queryParams)
    const requestOptions = await buildRequestOptions(method)

    const response = await retry(() => fetch(requestUrl, requestOptions), {
      timeout: 30000,
      checkFetchResponse: true,
      serviceName: 'GrantScoringService.makeScoringApiRequest'
    })

    await handleResponse(response, grantCode)

    return response
  } catch (error) {
    logScoringUpstreamError(request, url, error)
    if (error instanceof GrantScoringServiceApiError) {
      throw error
    }

    const err = /** @type {{ status?: number, message?: string }} */ (error)
    throw new GrantScoringServiceApiError(
      'Failed to process Scoring API request: ' + err.message,
      /** @type {number} */ (err.status),
      /** @type {string} */ (err.message),
      grantCode,
      /** @type {Error} */ (error)
    )
  }
}

/**
 * @import { PipelineRequest } from '~/src/server/common/request-pipeline/types.js'
 */
