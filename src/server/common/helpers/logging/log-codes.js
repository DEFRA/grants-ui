import { validateLogCode } from './log-code-validator.js'

export const LogCodes = {
  AUTH: {
    SIGN_IN_ATTEMPT: {
      level: 'info',
      messageFunc: (messageOptions) => `User sign-in attempt for user=${messageOptions.userId || 'unknown'}`
    },
    SIGN_IN_SUCCESS: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `User sign-in successful for user=${messageOptions.userId}, organisation=${messageOptions.organisationId}`
    },
    SIGN_IN_FAILURE: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `User sign-in failed for user=${messageOptions.userId || 'unknown'}. Error: ${messageOptions.error}`
    },
    SIGN_OUT: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `User sign-out for user=${messageOptions.userId}, session=${messageOptions.sessionId}`
    },
    TOKEN_VERIFICATION_SUCCESS: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Token verification successful for user=${messageOptions.userId}, organisation=${messageOptions.organisationId}`
    },
    TOKEN_VERIFICATION_FAILURE: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Token verification failed for user=${messageOptions.userId || 'unknown'}. Error: ${messageOptions.error}`
    },
    SESSION_EXPIRED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Session expired for user=${messageOptions.userId}, session=${messageOptions.sessionId}`
    },
    UNAUTHORIZED_ACCESS: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Unauthorized access attempt to path=${messageOptions.path} from user=${messageOptions.userId || 'unknown'}`
    },
    AUTH_DEBUG: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `Auth debug for path=${messageOptions.path}: isAuthenticated=${messageOptions.isAuthenticated}, strategy=${messageOptions.strategy}, mode=${messageOptions.mode}, hasCredentials=${messageOptions.hasCredentials}, hasToken=${messageOptions.hasToken}, hasProfile=${messageOptions.hasProfile}, userAgent=${messageOptions.userAgent}, referer=${messageOptions.referer}, queryParams=${JSON.stringify(messageOptions.queryParams)}, authError=${messageOptions.authError}`
    }
  },
  FORMS: {
    FORM_LOAD: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Form loaded: ${messageOptions.formName} for user=${messageOptions.userId || 'unknown'}`
    },
    FORM_SUBMIT: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Form submitted: ${messageOptions.formName} by user=${messageOptions.userId || 'unknown'}`
    },
    FORM_VALIDATION_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) => `Form validation error in ${messageOptions.formName}: ${messageOptions.error}`
    },
    FORM_VALIDATION_SUCCESS: {
      level: 'info',
      messageFunc: (messageOptions) => `Form validation successful for ${messageOptions.formName}`
    },
    FORM_PROCESSING_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) => `Form processing error for ${messageOptions.formName}: ${messageOptions.error}`
    },
    FORM_SAVE: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Form saved: ${messageOptions.formName} for user=${messageOptions.userId || 'unknown'}`
    }
  },
  SUBMISSION: {
    SUBMISSION_STARTED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Grant submission started for grantType=${messageOptions.grantType}, user=${messageOptions.userId}`
    },
    SUBMISSION_SUCCESS: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Grant submission successful for grantType=${messageOptions.grantType}, referenceNumber=${messageOptions.referenceNumber}`
    },
    SUBMISSION_FAILURE: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Grant submission failed for grantType=${messageOptions.grantType}, user=${messageOptions.userId}. Error: ${messageOptions.error}`
    },
    SUBMISSION_VALIDATION_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Submission validation error for grantType=${messageOptions.grantType}: ${messageOptions.error}`
    },
    SUBMISSION_PAYLOAD_LOG: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `Submission payload for grantType=${messageOptions.grantType}:\n${JSON.stringify(messageOptions.payload, null, 2)}`
    }
  },
  DECLARATION: {
    DECLARATION_LOAD: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Declaration page loaded for user=${messageOptions.userId}, grantType=${messageOptions.grantType}`
    },
    DECLARATION_ACCEPTED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Declaration accepted by user=${messageOptions.userId}, grantType=${messageOptions.grantType}`
    },
    DECLARATION_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Declaration processing error for user=${messageOptions.userId}: ${messageOptions.error}`
    }
  },
  CONFIRMATION: {
    CONFIRMATION_LOAD: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Confirmation page loaded for user=${messageOptions.userId}, grantType=${messageOptions.grantType}`
    },
    CONFIRMATION_SUCCESS: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Confirmation processed successfully for user=${messageOptions.userId}, referenceNumber=${messageOptions.referenceNumber}`
    },
    CONFIRMATION_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Confirmation processing error for user=${messageOptions.userId}: ${messageOptions.error}`
    }
  },
  TASKLIST: {
    TASKLIST_LOAD: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Task list loaded for user=${messageOptions.userId}, grantType=${messageOptions.grantType}`
    },
    TASK_COMPLETED: {
      level: 'info',
      messageFunc: (messageOptions) => `Task completed: ${messageOptions.taskName} for user=${messageOptions.userId}`
    },
    TASK_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) => `Task processing error for ${messageOptions.taskName}: ${messageOptions.error}`
    }
  },
  LAND_GRANTS: {
    LAND_GRANT_APPLICATION_STARTED: {
      level: 'info',
      messageFunc: (messageOptions) => `Land grant application started for user=${messageOptions.userId}`
    },
    LAND_GRANT_APPLICATION_SUBMITTED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Land grant application submitted for user=${messageOptions.userId}, referenceNumber=${messageOptions.referenceNumber}`
    },
    LAND_GRANT_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Land grant processing error for user=${messageOptions.userId}: ${messageOptions.error}`
    }
  },
  AGREEMENTS: {
    AGREEMENT_LOAD: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Agreement loaded for user=${messageOptions.userId}, agreementType=${messageOptions.agreementType}`
    },
    AGREEMENT_ACCEPTED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Agreement accepted by user=${messageOptions.userId}, agreementType=${messageOptions.agreementType}`
    },
    AGREEMENT_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Agreement processing error for user=${messageOptions.userId}: ${messageOptions.error}`
    }
  },

  SYSTEM: {
    VIEW_DEBUG: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `View path debug: currentFile=${messageOptions.currentFilePath}, isBuilt=${messageOptions.isRunningBuiltCode}, basePath=${messageOptions.basePath}, workingDir=${messageOptions.processWorkingDir}, pathsResolved=${messageOptions.resolvedViewPaths?.length || 0}`
    },
    VIEW_PATH_CHECK: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `View path ${messageOptions.index}: path=${messageOptions.path}, exists=${messageOptions.exists}, isAbsolute=${messageOptions.isAbsolute}`
    },
    ENV_CONFIG_DEBUG: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `Environment configuration: ${messageOptions.configType} - ${JSON.stringify(messageOptions.configValues)}`
    },
    SERVER_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) => `Server error occurred: ${messageOptions.error}`
    },
    STARTUP_PHASE: {
      level: 'info',
      messageFunc: (messageOptions) => `Startup phase: ${messageOptions.phase} - ${messageOptions.status}`
    },
    PLUGIN_REGISTRATION: {
      level: 'debug',
      messageFunc: (messageOptions) => `Plugin registration: ${messageOptions.pluginName} - ${messageOptions.status}`
    },
    SYSTEM_STARTUP: {
      level: 'info',
      messageFunc: (messageOptions) => `System startup completed on port=${messageOptions.port}`
    },
    SYSTEM_SHUTDOWN: {
      level: 'info',
      messageFunc: () => `System shutdown initiated`
    },
    EXTERNAL_API_CALL: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `External API call to ${messageOptions.endpoint} for user=${messageOptions.userId || 'unknown'}`
    },
    EXTERNAL_API_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) => `External API error for ${messageOptions.endpoint}: ${messageOptions.error}`
    }
  }
}

// Validate all log codes once at startup
export const validateLogCodes = (logCodes) => {
  Object.values(logCodes).forEach((entry) => {
    Object.entries(entry).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        throw new Error('logCode must be a non-empty object')
      }

      // Check if this is a leaf node (has level and messageFunc) or a nested node
      if (typeof value === 'object' && value !== null) {
        if ('level' in value || 'messageFunc' in value) {
          // This is a leaf node, check that it has both required properties
          if (!('level' in value && 'messageFunc' in value)) {
            throw new Error(`Invalid log code definition for "${key}": Missing "level" or "messageFunc"`)
          }

          try {
            validateLogCode(value)
          } catch (e) {
            throw new Error(`Invalid log code definition for "${key}": ${e.message}`)
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
  throw new Error(`Log code validation failed: ${error.message}`)
}
