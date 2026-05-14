import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'

/**
 * Logs an upstream/external API error against `SYSTEM.EXTERNAL_API_ERROR`.
 *
 * Centralises the call-site logging pattern used when a downstream service
 * (land grants backend, GAS, agreements proxy, ...) returns a non-OK response or
 * the request otherwise fails, so it stays consistent with the rest of the
 * logging style.
 *
 * @param {object} details
 * @param {string} details.endpoint - The endpoint or URL that was called.
 * @param {string} details.service - The downstream service name.
 * @param {number | string | null | undefined} details.upstreamStatus - HTTP status returned by the upstream service, if any.
 * @param {string} details.errorMessage - The error message.
 * @param {number} [details.attempts] - Number of attempts made before giving up (optional).
 * @param {import('@hapi/hapi').Request} [request] - Hapi request object (optional).
 */
export function logUpstreamError({ endpoint, service, upstreamStatus, errorMessage, attempts }, request) {
  log(
    LogCodes.SYSTEM.EXTERNAL_API_ERROR,
    {
      endpoint,
      service,
      upstreamStatus: upstreamStatus ?? null,
      ...(attempts === undefined ? {} : { attempts }),
      errorMessage
    },
    request
  )
}
