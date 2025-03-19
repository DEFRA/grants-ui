import { config } from '~/src/config/config.js'
import { tracing } from '@defra/hapi-tracing'

export const requestTracing = {
  plugin: tracing.plugin,
  options: { tracingHeader: config.get('tracing.header') }
}
