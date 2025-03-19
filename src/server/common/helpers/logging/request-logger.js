import hapiPino from 'hapi-pino'

import { loggerOptions } from '~/src/server/common/helpers/logging/logger-options.js'

/**
 * @satisfies {ServerRegisterPluginObject<Options>}
 */
export const requestLogger = {
  plugin: hapiPino,
  options: loggerOptions
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 * @import { Options } from 'hapi-pino'
 */
