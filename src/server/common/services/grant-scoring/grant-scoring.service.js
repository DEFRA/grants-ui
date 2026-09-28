import { config } from '~/src/config/config.js'
import { retry } from '~/src/server/common/helpers/retry.js'
import { getScoringServiceToken } from '~/src/server/common/helpers/auth/scoring-service-token.js'
import { withTraceId } from '@defra/hapi-tracing'
import { GrantScoringServiceError } from '~/src/server/common/utils/errors/GrantScoringServiceError.js'

const SCORING_SERVICE_URL = config.get('scoring.serviceUrl')

/**
 * Invokes a GET action on the Grant Scoring Service
 * @param {string} grantCode - Grant code
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} request
 * @param {Record<string, unknown>} [queryParams] - Optional query parameters
 * @returns {Promise<any>} - Promise that resolves to the response JSON
 * @throws {GrantScoringServiceError}
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
 * @throws {GrantScoringServiceError}
 * @private
 */
async function handleResponse(response, grantCode) {
  if (!response.ok) {
    const error = await response.json()
    const responseErrorMessage = error?.message ? ` - ${error.message}` : ''
    throw new GrantScoringServiceError({
      message: `${response.status} ${response.statusText}${responseErrorMessage}`,
      source: 'GrantScoringService.handleResponse',
      reason: 'grant_scoring_http_failure',
      status: 500,
      service: 'grant-scoring-service',
      grantCode,
      upstreamStatus: response.status
    })
  }

  return response
}

/**
 * Makes a request to the Grant Scoring Service API
 * @param {string} url - API endpoint URL
 * @param {string} grantCode - Grant code for error context
 * @param {import('@defra/forms-engine-plugin/types').AnyFormRequest} _request
 * @param {object} [options] - Request options
 * @param {string} [options.method] - HTTP method (GET, POST, etc.)
 * @param {Record<string, unknown>} [options.queryParams] - Query parameters for GET requests
 * @returns {Promise<Response>} - Promise that resolves to the response
 * @throws {GrantScoringServiceError}
 */
export async function makeScoringApiRequest(url, grantCode, _request, options = {}) {
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
    if (error instanceof GrantScoringServiceError) {
      throw error
    }
    throw new GrantScoringServiceError({
      message: 'Failed to get grant eligibility score result',
      source: 'GrantScoringService.makeScoringApiRequest',
      reason: 'grant_scoring_request_failure',
      status: 500,
      endpoint: url,
      service: 'grant-scoring-service',
      grantCode
    }).from(error)
  }
}

/**
 * @import { PipelineRequest } from '~/src/server/common/request-pipeline/types.js'
 */
