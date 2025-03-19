import {
  createMetricsLogger,
  Unit,
  StorageResolution
} from 'aws-embedded-metrics'

import { config } from '~/src/config/config.js'
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'

/**
 * Aws embedded metrics wrapper
 * @param {string} metricName
 * @param {number} value
 * @returns {Promise<void>}
 */
export async function metricsCounter(metricName, value = 1) {
  const isMetricsEnabled = config.get('isMetricsEnabled')

  if (!isMetricsEnabled) {
    return
  }

  try {
    const metricsLogger = createMetricsLogger()
    metricsLogger.putMetric(
      metricName,
      value,
      Unit.Count,
      StorageResolution.Standard
    )
    await metricsLogger.flush()
  } catch (error) {
    createLogger().error(error, error.message)
  }
}
