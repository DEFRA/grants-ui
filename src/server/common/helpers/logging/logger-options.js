/* istanbul ignore file */
import { ecsFormat } from '@elastic/ecs-pino-format'
import { config } from '~/src/config/config.js'
import { getTraceId } from '@defra/hapi-tracing'

// @ts-ignore - TS2589: Type instantiation excessively deep (convict type complexity)
const logConfig = config.get('log')
const serviceName = config.get('gitRepositoryName')
const serviceVersion = config.get('serviceVersion')

/**
 * @type {{ecs: Omit<LoggerOptions, "mixin"|"transport">, "pino-pretty": {transport: {target: string}}}}
 */
const formatters = {
  ecs: {
    ...ecsFormat({
      serviceVersion: serviceVersion ?? undefined,
      serviceName
    })
  },
  'pino-pretty': { transport: { target: 'pino-pretty' } }
}

const isDebugMode = logConfig.level === 'debug' || logConfig.level === 'trace'

// The Entra ID OIDC callback (src/server/auth/entraId/) uses responseMode: 'query', so Azure
// returns the single-use authorization code and PKCE state as query params on GET /login/callback.
// Strip them before request logs are written - they're short-lived and useless without the
// matching PKCE verifier cookie, but they're still bearer-like values that shouldn't sit in a log
// store. Two separate places carry them: pino-std-serializers' own hapi-aware req.url handling
// already drops query strings from `url` (it uses Hapi's query-less `request.path`), but its
// parsed `query` object is untouched - and pino-pretty's debug-level output logs that in full.
const REDACTED_QUERY_PARAMS = ['code', 'state']

/**
 * `request.url` on a Hapi Request is a WHATWG `URL` instance (not a string) - accept both so this
 * works whether it's called on the raw request or on an already-stringified path.
 *
 * @param {URL | string | null | undefined} url
 * @returns {string | null | undefined}
 */
function redactAuthQueryParams(url) {
  if (!url) {
    return url
  }
  const href = url instanceof URL ? url.href : url
  // Parse a fresh URL rather than mutating `url` in place - it may be the live request's own
  // cached URL object, and mutating that would corrupt request handling elsewhere.
  const parsed = new URL(href, 'http://localhost')
  for (const param of REDACTED_QUERY_PARAMS) {
    if (parsed.searchParams.has(param)) {
      parsed.searchParams.set(param, '[redacted]')
    }
  }
  return parsed.href
}

/**
 * @param {Record<string, unknown> | undefined} query
 * @returns {Record<string, unknown> | undefined}
 */
function redactAuthQuery(query) {
  if (!query) {
    return query
  }
  let redacted = query
  for (const param of REDACTED_QUERY_PARAMS) {
    if (redacted[param] !== undefined) {
      // Clone lazily, only once, so the common case (no matching param) allocates nothing.
      redacted = redacted === query ? { ...query } : redacted
      redacted[param] = '[redacted]'
    }
  }
  return redacted
}

/**
 * @satisfies {Options}
 */
export const loggerOptions = {
  enabled: logConfig.enabled,
  ignorePaths: ['/health'],
  redact: {
    paths: logConfig.redact,
    remove: true
  },
  level: logConfig.level,
  // @ts-ignore - TS7053 (strict/IDE only): logConfig is `any` (config.get is @ts-ignored
  // above for convict's TS2589 depth limit), so this index key is `any`.
  ...formatters[logConfig.format],
  nesting: true,
  serializers: {
    // Runs in both modes - the slim {id, url} shape for info level, or the full
    // pino-std-serializers-produced object (headers, remoteAddress, etc.) for debug level, since
    // that's the one that otherwise logs `query.code`/`query.state` unredacted.
    req: (req) =>
      isDebugMode
        ? { ...req, url: redactAuthQueryParams(req.url), query: redactAuthQuery(req.query) }
        : { id: req.id, url: redactAuthQueryParams(req.url) },
    ...(!isDebugMode && {
      res: (res) => ({
        statusCode: res.statusCode
      })
    })
  },
  ...(!isDebugMode && {
    customRequestCompleted: (
      /** @type {import('@hapi/hapi').Request} */ req,
      /** @type {import('node:http').ServerResponse} */ res,
      /** @type {number} */ responseTime
    ) => {
      return `[response] ${req.method} ${redactAuthQueryParams(req.url)} ${res.statusCode} (${responseTime}ms)`
    }
  }),
  mixin() {
    const mixinValues = {}
    const traceId = getTraceId()
    if (traceId) {
      mixinValues.trace = { id: traceId }
    }
    return mixinValues
  }
}

/**
 * @import { Options } from 'hapi-pino'
 * @import { LoggerOptions } from 'pino'
 */
