/* istanbul ignore file */
import { ecsFormat } from '@elastic/ecs-pino-format'
import { config } from '~/src/config/config.js'
import { getTraceId } from '@defra/hapi-tracing'

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
    customRequestCompleted: (req, res, responseTime) => {
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
