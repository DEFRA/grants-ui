import { AsyncLocalStorage } from 'node:async_hooks'
import diagnosticsChannel from 'node:diagnostics_channel'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { Metrics } from '@defra/cdp-metrics'
import { StorageResolution, Unit } from 'aws-embedded-metrics'

import { config } from '~/src/config/config.js'
import { attemptSync } from '~/src/server/common/helpers/attempt.js'
import { log, LogCodes } from '~/src/server/common/helpers/logging/log.js'
import { currentRequest } from '~/src/server/common/helpers/request-context.js'

/**
 * Times and counts every outbound HTTP call, with no code at call sites.
 *
 * `installOutboundCallMetrics()` subscribes once at start-up to Node's
 * diagnostics channels for outgoing requests:
 * - `undici:request:*` for `fetch` (with or without the undici proxy dispatcher);
 * - `http.client.*` for everything built on `node:http`: Wreck, h2o2, Bell / OIDC
 *   and the AWS SDK. Each SDK retry is a separate request, so each one is counted.
 *
 * Redis (ioredis) is plain TCP and is not covered.
 */

export const NON_SCHEME_SPECIFIC = 'non-scheme-specific'

export const OutboundMetricName = Object.freeze({
  COUNT: 'OutboundRequestCount',
  DURATION: 'OutboundRequestDuration',
  FAILURE: 'OutboundRequestFailure'
})

/**
 * Config settings holding each dependency's base URL. A call is attributed to the
 * dependency whose base URL it matches; any other host is reported by hostname.
 */
const SERVICE_URL_SETTINGS = Object.freeze({
  'grants-ui-backend': 'session.cache.apiEndpoint',
  gas: 'gas.apiEndpoint',
  'land-grants-api': 'landGrants.grantsServiceApiEndpoint',
  'grant-scoring': 'scoring.serviceUrl',
  'consolidated-view': 'consolidatedView.apiEndpoint',
  'defra-id': 'defraId.wellKnownUrl',
  entra: 'entra.tokenEndpoint',
  'os-maps': 'maps.land.baseUrl',
  agreements: 'agreements.uiUrl'
})

/** Dependencies shared by every grant, so their calls are never attributed to a scheme. */
const NON_SCHEME_SERVICES = new Set(['defra-id', 'entra'])

const CHANNELS = Object.freeze({
  FETCH_CREATE: 'undici:request:create',
  FETCH_HEADERS: 'undici:request:headers',
  FETCH_ERROR: 'undici:request:error',
  HTTP_START: 'http.client.request.start',
  HTTP_RESPONSE: 'http.client.response.finish',
  HTTP_ERROR: 'http.client.request.error'
})

const KNOWN_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const tooManyRequests = 429
const firstServerErrorStatus = 500

// Grant codes are lower-case kebab identifiers. Anything else (or anything
// suspiciously long) would otherwise create unbounded CloudWatch dimension values.
const SCHEME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

// Failures are logged by finishCall, so the library needs no logger of its own.
const metrics = new Metrics()

// Marks work done while sending metrics. The EMF library can make HTTP calls of
// its own (e.g. ECS metadata discovery), and measuring those would loop.
const emitting = new AsyncLocalStorage()

/** @type {Array<{ service: string, origin: string, segments: string[] }>} */
let knownServices = []

/** @type {WeakMap<object, PendingCall>} */
const pendingCalls = new WeakMap()

let installed = false

/** @type {string} Where each data point is also written for local testing; empty when off */
let debugLogFile = ''

/** @type {Promise<unknown> | undefined} */
let debugLogDirReady

/**
 * @param {unknown} scheme
 * @returns {string}
 */
export function toSchemeDimension(scheme) {
  return typeof scheme === 'string' && SCHEME_PATTERN.test(scheme) ? scheme : NON_SCHEME_SPECIFIC
}

/**
 * @param {unknown} value
 * @returns {URL | undefined}
 */
function parseUrl(value) {
  return typeof value === 'string' && URL.canParse(value) ? new URL(value) : undefined
}

/**
 * @param {string} pathname
 * @returns {string[]}
 */
const pathSegments = (pathname) => pathname.split('/').filter(Boolean)

/** @returns {Array<{ service: string, origin: string, segments: string[] }>} */
function buildKnownServices() {
  return Object.entries(SERVICE_URL_SETTINGS).flatMap(([service, setting]) => {
    const url = parseUrl(config.get(/** @type {any} */ (setting)))
    return url ? [{ service, origin: url.origin, segments: pathSegments(url.pathname) }] : []
  })
}

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} How many leading path segments the two share
 */
function sharedSegments(a, b) {
  let count = 0
  while (count < a.length && count < b.length && a[count] === b[count]) {
    count++
  }
  return count
}

/**
 * Finds the dependency for a URL by matching it against the configured base URLs.
 * In deployed environments each dependency has its own origin. Where several share
 * one (e.g. locally, behind a mock server), the base URL sharing the most leading
 * path segments wins; ties go to the first in {@link SERVICE_URL_SETTINGS}. This
 * also attributes Defra ID's token and JWKS endpoints, which sit beside rather
 * than under its well-known URL. A host with no configured dependency is
 * reported by its hostname.
 * @param {URL} url
 * @returns {string}
 */
function serviceFor(url) {
  const segments = pathSegments(url.pathname)
  let best
  let bestScore = -1
  for (const candidate of knownServices) {
    const score = candidate.origin === url.origin ? sharedSegments(candidate.segments, segments) : -1
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best?.service ?? url.hostname
}

/**
 * @param {string} service
 * @returns {string}
 */
function schemeFor(service) {
  if (NON_SCHEME_SERVICES.has(service)) {
    return NON_SCHEME_SPECIFIC
  }
  const request = /** @type {{ params?: { slug?: unknown } } | undefined} */ (currentRequest())
  return toSchemeDimension(request?.params?.slug)
}

/**
 * @param {unknown} method
 * @returns {string}
 */
function methodDimension(method) {
  const upper = typeof method === 'string' ? method.toUpperCase() : 'GET'
  return KNOWN_METHODS.has(upper) ? upper : 'OTHER'
}

/**
 * @param {number | undefined} status
 * @returns {boolean} Whether the status means the dependency failed. A 4xx other than 429 is a normal answer.
 */
function isFailedStatus(status) {
  return typeof status === 'number' && (status >= firstServerErrorStatus || status === tooManyRequests)
}

/**
 * @param {object} key - The request object published on the channel
 * @param {URL | undefined} url
 * @param {unknown} method
 */
function startCall(key, url, method) {
  if (!url || emitting.getStore()) {
    return
  }
  const service = serviceFor(url)
  pendingCalls.set(key, {
    service,
    method: methodDimension(method),
    scheme: schemeFor(service),
    start: performance.now()
  })
}

/**
 * Appends one data point to the local debug log, exactly as given to the metrics logger.
 * @param {{ dimensions: Array<Record<string, string>>, metrics: Array<{ name: string, value: number, unit: string }> }} dataPoint
 * @returns {Promise<void>}
 */
async function writeDebugLog(dataPoint) {
  debugLogDirReady ??= mkdir(path.dirname(debugLogFile), { recursive: true })
  await debugLogDirReady
  await appendFile(debugLogFile, `${JSON.stringify({ timestamp: new Date().toISOString(), ...dataPoint })}\n`)
}

/**
 * @param {PendingCall} call
 * @param {boolean} failed
 * @returns {Promise<unknown>}
 */
function emit({ service, method, scheme, start }, failed) {
  /** @type {Array<Record<string, string>>} */
  const dimensions = [
    { Service: service },
    { Service: service, Scheme: scheme },
    { Service: service, Method: method, Scheme: scheme }
  ]
  const values = [
    { name: OutboundMetricName.COUNT, value: 1, unit: Unit.Count },
    { name: OutboundMetricName.DURATION, value: performance.now() - start, unit: Unit.Milliseconds },
    { name: OutboundMetricName.FAILURE, value: failed ? 1 : 0, unit: Unit.Count }
  ]

  const metricsLogger = metrics.getMetricsLogger()
  metricsLogger.setDimensions(dimensions)
  for (const { name, value, unit } of values) {
    metricsLogger.putMetric(name, value, unit, StorageResolution.Standard)
  }

  return Promise.all([metricsLogger.flush(), debugLogFile && writeDebugLog({ dimensions, metrics: values })])
}

/**
 * Not awaited, and never throws: metrics must not hold up or fail the call being measured.
 * @param {object} key - The request object published on the channel
 * @param {boolean} failed
 */
function finishCall(key, failed) {
  const call = pendingCalls.get(key)
  if (!call) {
    return
  }
  // A request can fail after its response headers arrive; only the first outcome counts.
  pendingCalls.delete(key)

  emitting.run(true, () => {
    Promise.resolve()
      .then(() => emit(call, failed))
      .catch((/** @type {Error} */ error) =>
        log(LogCodes.SYSTEM.METRICS_EMIT_FAILED, {
          service: call.service,
          method: call.method,
          errorMessage: error?.message
        })
      )
  })
}

/**
 * @param {{ origin?: unknown, path?: string }} request - An undici request
 * @returns {URL | undefined}
 */
function urlOfFetchRequest({ origin, path = '' }) {
  // Through a forward proxy, `origin` is the proxy and `path` the absolute target URL.
  return parseUrl(path) ?? parseUrl(`${origin}${path}`)
}

/**
 * @param {import('node:http').ClientRequest} request
 * @returns {URL | undefined}
 */
function urlOfHttpRequest(request) {
  const hostHeader = request.getHeader('host')
  const host = typeof hostHeader === 'string' ? hostHeader : request.host
  // Through a forward proxy, the path is the absolute target URL.
  return parseUrl(request.path) ?? parseUrl(`${request.protocol}//${host}${request.path}`)
}

/** @type {Record<string, (message: any) => void>} */
const handlers = {
  [CHANNELS.FETCH_CREATE]: ({ request }) => {
    // The tunnel to the egress proxy for an HTTPS call; the call itself is published separately.
    if (request.method !== 'CONNECT') {
      startCall(request, urlOfFetchRequest(request), request.method)
    }
  },
  [CHANNELS.FETCH_HEADERS]: ({ request, response }) => finishCall(request, isFailedStatus(response.statusCode)),
  [CHANNELS.FETCH_ERROR]: ({ request }) => finishCall(request, true),
  [CHANNELS.HTTP_START]: ({ request }) => startCall(request, urlOfHttpRequest(request), request.method),
  [CHANNELS.HTTP_RESPONSE]: ({ request, response }) => finishCall(request, isFailedStatus(response.statusCode)),
  [CHANNELS.HTTP_ERROR]: ({ request }) => finishCall(request, true)
}

/**
 * A subscriber that throws would surface as an uncaught exception, so every
 * handler is guarded: a metrics bug is logged and the call carries on.
 * @type {Record<string, (message: unknown) => void>}
 */
const subscribers = Object.fromEntries(
  Object.entries(handlers).map(([name, handler]) => [
    name,
    (/** @type {unknown} */ message) => {
      const result = attemptSync(() => handler(message))
      if (!result.ok) {
        log(LogCodes.SYSTEM.METRICS_EMIT_FAILED, {
          service: 'unknown',
          method: name,
          errorMessage: result.error.message
        })
      }
    }
  ])
)

/**
 * Starts recording metrics for every outbound HTTP call. Call once at start-up.
 * Does nothing when metrics are disabled.
 */
export function installOutboundCallMetrics() {
  if (installed || !config.get('isMetricsEnabled')) {
    return
  }
  installed = true
  knownServices = buildKnownServices()
  debugLogFile = config.get('metricsDebugLogFile')
  debugLogDirReady = undefined
  for (const [name, subscriber] of Object.entries(subscribers)) {
    diagnosticsChannel.subscribe(name, subscriber)
  }
}

/** Reverses {@link installOutboundCallMetrics}. Intended for tests. */
export function uninstallOutboundCallMetrics() {
  if (!installed) {
    return
  }
  installed = false
  for (const [name, subscriber] of Object.entries(subscribers)) {
    diagnosticsChannel.unsubscribe(name, subscriber)
  }
}

/**
 * @typedef {object} PendingCall
 * @property {string} service
 * @property {string} method
 * @property {string} scheme
 * @property {number} start - `performance.now()` when the call started
 */
