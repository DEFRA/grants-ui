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
  ...(!isDebugMode && {
    serializers: {
      req: (req) => ({
        id: req.id,
        url: req.url
      }),
      res: (res) => ({
        statusCode: res.statusCode
      })
    },
    customRequestCompleted: (
      /** @type {import('@hapi/hapi').Request} */ req,
      /** @type {import('node:http').ServerResponse} */ res,
      /** @type {number} */ responseTime
    ) => {
      return `[response] ${req.method} ${req.url} ${res.statusCode} (${responseTime}ms)`
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
