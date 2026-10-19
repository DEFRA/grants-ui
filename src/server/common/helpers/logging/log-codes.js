import Joi from 'joi'
import { LogCodes } from './log-codes/definition.js'

// Re-export LogCodes from the definition file
export { LogCodes }

const logCodeSchema = Joi.object({
  level: Joi.string().valid('info', 'debug', 'warn', 'error').required(),
  messageFunc: Joi.function().required()
}).unknown()

// A value with either leaf key is a log code; anything else must be a non-empty group of them.
const looksLikeLogCode = Joi.object({ level: Joi.any(), messageFunc: Joi.any() }).or('level', 'messageFunc').unknown()
const groupSchema = Joi.object()
  .pattern(
    Joi.string(),
    Joi.alternatives().conditional(looksLikeLogCode, { then: logCodeSchema, otherwise: Joi.link('#group') })
  )
  .min(1)
  .id('group')

/**
 * Validates all log codes once at startup, recursing into nested groups.
 * @param {Record<string, object>} logCodes - Map of log code groups or leaf definitions to validate.
 * @returns {void}
 */
export const validateLogCodes = (logCodes) => {
  const { error } = groupSchema.validate(logCodes)
  if (error) {
    throw new Error(`Invalid log code definition: ${error.message}`, { cause: error })
  }
}

// Validate log codes at startup
try {
  validateLogCodes(LogCodes)
} catch (error) {
  throw new Error(`Log code validation failed: ${/** @type {Error} */ (error).message}`, { cause: error })
}
