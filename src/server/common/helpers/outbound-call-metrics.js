import { Metrics } from '@defra/cdp-metrics'
import { StorageResolution, Unit } from 'aws-embedded-metrics'

import { config } from '~/src/config/config.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { currentRequest } from '~/src/server/common/helpers/request-context.js'

/**
 * The `Scheme` dimension value for calls that are not made on behalf of a
 * specific grant (e.g. Defra ID discovery, Entra tokens, the allowlist).
 */
export const NON_SCHEME_SPECIFIC = 'non-scheme-specific'

/**
 * Names used for the `Service` dimension. Keep these stable: they are what
 * dashboards and alarms in Grafana are built on.
 */
export const OutboundService = Object.freeze({
  GRANTS_UI_BACKEND: 'grants-ui-backend',
  GAS: 'gas',
  LAND_GRANTS_API: 'land-grants-api',
  GRANT_SCORING: 'grant-scoring',
  CONSOLIDATED_VIEW: 'consolidated-view',
  DEFRA_ID: 'defra-id',
  ENTRA: 'entra',
  OS_MAPS: 'os-maps',
  AUDIT_SNS: 'audit-sns'
})

export const OutboundMetricName = Object.freeze({
  COUNT: 'OutboundRequestCount',
  DURATION: 'OutboundRequestDuration',
  FAILURE: 'OutboundRequestFailure'
})

const tooManyRequests = 429
const firstServerErrorStatus = 500

// Grant codes are lower-case kebab identifiers. Anything else (or anything
// suspiciously long) is not a scheme we know about and would otherwise create
// unbounded CloudWatch dimension values.
const SCHEME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

// Failures are logged by emitInBackground, so the library needs no logger of its own.
const metrics = new Metrics()

/**
 * Normalises a grant code / slug into a bounded `Scheme` dimension value.
 * @param {unknown} scheme
 * @returns {string}
 */
export function toSchemeDimension(scheme) {
  return typeof scheme === 'string' && SCHEME_PATTERN.test(scheme) ? scheme : NON_SCHEME_SPECIFIC
}

/**
 * Resolves the scheme for the current call: an explicit grant code wins,
 * otherwise the `slug` of the request currently being handled (if any).
 * @param {string | undefined} scheme
 * @returns {string}
 */
function resolveScheme(scheme) {
  const request = /** @type {{ params?: { slug?: unknown } } | undefined} */ (currentRequest())
  return toSchemeDimension(scheme ?? request?.params?.slug)
}

/**
 * Default failure classification. A thrown error is always a failure; for a
 * fetch `Response` only server errors and throttling count, because 4xx
 * responses such as "no saved state" (404) are normal answers from a healthy
 * dependency.
 * @param {unknown} result
 * @returns {boolean}
 */
function isFailedResponse(result) {
  const status = /** @type {{ status?: unknown } | null | undefined} */ (result)?.status
  return typeof status === 'number' && (status >= firstServerErrorStatus || status === tooManyRequests)
}

/**
 * @param {OutboundCallDescriptor & { scheme: string }} descriptor
 * @param {number} durationMs
 * @param {() => boolean} failed
 * @returns {Promise<void>}
 */
function emit({ service, operation, scheme }, durationMs, failed) {
  const metricsLogger = metrics.getMetricsLogger()
  // Several dimension sets so Grafana can show load per dependency, per
  // dependency and scheme, and per individual operation without metric maths.
  metricsLogger.setDimensions([
    { Service: service },
    { Service: service, Scheme: scheme },
    { Service: service, Operation: operation, Scheme: scheme }
  ])
  metricsLogger.putMetric(OutboundMetricName.COUNT, 1, Unit.Count, StorageResolution.Standard)
  metricsLogger.putMetric(OutboundMetricName.DURATION, durationMs, Unit.Milliseconds, StorageResolution.Standard)
  metricsLogger.putMetric(OutboundMetricName.FAILURE, failed() ? 1 : 0, Unit.Count, StorageResolution.Standard)
  return metricsLogger.flush()
}

/**
 * Emits metrics in the background. Not awaited, and never throws: metrics must
 * not hold up or fail the call being measured.
 * @param {OutboundCallDescriptor & { scheme: string }} descriptor
 * @param {number} durationMs
 * @param {() => boolean} failed
 */
function emitInBackground(descriptor, durationMs, failed) {
  Promise.resolve()
    .then(() => emit(descriptor, durationMs, failed))
    .catch((/** @type {Error} */ error) =>
      log(LogCodes.SYSTEM.METRICS_EMIT_FAILED, {
        service: descriptor.service,
        operation: descriptor.operation,
        errorMessage: error?.message
      })
    )
}

/**
 * Times and counts a single outbound call to a dependency, emitting CloudWatch
 * EMF metrics via `@defra/cdp-metrics` (`OutboundRequestCount`,
 * `OutboundRequestDuration` and `OutboundRequestFailure`, dimensioned by
 * `Service`, `Operation` and `Scheme`).
 *
 * Wrap each individual network attempt (i.e. inside any retry loop) so that
 * the count reflects the real load placed on the dependency. The call's result
 * is returned and its errors re-thrown unchanged.
 *
 * @template T
 * @param {OutboundCallDescriptor} descriptor
 * @param {() => Promise<T>} call
 * @returns {Promise<T>}
 */
export async function withOutboundMetrics(descriptor, call) {
  if (!config.get('isMetricsEnabled')) {
    return call()
  }

  const resolved = { ...descriptor, scheme: resolveScheme(descriptor.scheme) }
  const isFailure = descriptor.isFailure ?? isFailedResponse
  const start = performance.now()

  let result
  try {
    result = await call()
  } catch (error) {
    emitInBackground(resolved, performance.now() - start, () => true)
    throw error
  }

  emitInBackground(resolved, performance.now() - start, () => isFailure(result))
  return result
}

/**
 * @typedef {object} OutboundCallDescriptor
 * @property {string} service - The dependency being called; prefer an {@link OutboundService} value.
 * @property {string} operation - A stable, low-cardinality name for the call (never a raw URL or id).
 * @property {string} [scheme] - The grant code the call is made for. Defaults to the current request's slug,
 *   or {@link NON_SCHEME_SPECIFIC} when there is none.
 * @property {(result: any) => boolean} [isFailure] - Overrides how a resolved result is classified.
 */
