import { validateLogCode } from './log-code-validator.js'
import { LogCodes } from './log-codes-definition.js'

// Re-export LogCodes from the definition file
export { LogCodes }

// Validate all log codes once at startup
export const validateLogCodes = (logCodes) => {
  Object.values(logCodes).forEach((entry) => {
    Object.entries(entry).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        throw new Error('logCode must be a non-empty object')
      }

      // Check if this is a leaf node (has level and messageFunc) or a nested node
      if (typeof value === 'object') {
        if ('level' in value || 'messageFunc' in value) {
          // This is a leaf node, check that it has both required properties
          if (!('level' in value && 'messageFunc' in value)) {
            throw new Error(`Invalid log code definition for "${key}": Missing "level" or "messageFunc"`)
          }

          try {
            validateLogCode(value)
          } catch (e) {
            throw new Error(`Invalid log code definition for "${key}": ${e.message}`, { cause: e })
          }
        } else {
          // This is a nested node, recursively validate it
          validateLogCodes({ [key]: value })
        }
      } else {
        throw new Error(`Invalid log code definition for "${key}": unexpected value type`)
      }
    })
  })
}

// Validate log codes at startup
try {
  validateLogCodes(LogCodes)
} catch (error) {
  throw new Error(`Log code validation failed: ${error.message}`, { cause: error })
}
