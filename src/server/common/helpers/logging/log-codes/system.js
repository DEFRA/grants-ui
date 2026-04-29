/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const SYSTEM = {
  GENERIC_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) => `An error occurred: ${messageOptions.errorMessage}`
  },
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
    messageFunc: (messageOptions) => {
      const suffix =
        messageOptions.upstreamStatus !== undefined && messageOptions.upstreamStatus !== null
          ? ` | upstreamStatus=${messageOptions.upstreamStatus}`
          : ''
      return `Server error occurred: ${messageOptions.errorMessage}${suffix}`
    }
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
    messageFunc: () => 'System shutdown initiated'
  },
  EXTERNAL_API_CALL: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `External API call to ${messageOptions.endpoint} for user=${messageOptions.userId || 'unknown'}`
  },
  EXTERNAL_API_CALL_DEBUG: {
    level: 'debug',
    messageFunc: (messageOptions) =>
      `External ${messageOptions.method} to ${new URL(messageOptions.endpoint).pathname} (${messageOptions.identity || 'unknown'})`
  },
  EXTERNAL_API_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) => {
      const parts = [`External API error for ${messageOptions.endpoint}`]
      if (messageOptions.service) {
        parts.push(`service=${messageOptions.service}`)
      }
      if (messageOptions.upstreamStatus !== undefined && messageOptions.upstreamStatus !== null) {
        parts.push(`upstreamStatus=${messageOptions.upstreamStatus}`)
      }
      if (messageOptions.attempts !== undefined && messageOptions.attempts !== null) {
        parts.push(`attempts=${messageOptions.attempts}`)
      }
      return `${parts.join(' | ')}: ${messageOptions.errorMessage}`
    }
  },
  GAS_ACTION_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Error invoking GAS action ${messageOptions.action} for grant ${messageOptions.grantCode}: ${messageOptions.errorMessage}`
  },
  BACKEND_AUTH_CONFIG_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Backend auth configuration invalid | missingKeys=${messageOptions.missingKeys?.join(', ') || 'unknown'}`
  },
  RELATIONSHIP_PARSE_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `extractFarmDetails: Invalid relationship format | relationships="${messageOptions.relationships}" | reason=${messageOptions.reason}`
  },
  CONFIG_MISSING: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Missing required configuration: ${messageOptions?.missing?.join(', ') || 'unknown'}`
  },
  CONFIG_INVALID: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Invalid configuration, key "${messageOptions.key}" is missing or invalid: ${messageOptions.value}`
  },
  WHITELIST_CONFIG_INCOMPLETE: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Incomplete whitelist configuration in form "${messageOptions.formName}" | present=${messageOptions.presentVar} | missing=${messageOptions.missingVar}`
  },
  CRN_ENV_VAR_MISSING: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `CRN whitelist environment variable "${messageOptions.envVar}" missing for form "${messageOptions.formName}"`
  },
  SBI_ENV_VAR_MISSING: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `SBI whitelist environment variable "${messageOptions.envVar}" missing for form "${messageOptions.formName}"`
  },
  INVALID_REDIRECT_RULES: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Invalid redirect rules in form "${messageOptions.formName}" | reason=${messageOptions.reason}`
  },
  CONSOLIDATED_VIEW_API_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) => {
      const base = `Unexpected error fetching business data from Consolidated View API | sbi=${messageOptions.sbi || 'unknown'} | status=${messageOptions.statusCode || 'unknown'} | error=${messageOptions.errorMessage}`
      return messageOptions.responseBody ? `${base} | responseBody=${messageOptions.responseBody}` : base
    }
  },
  CONSOLIDATED_VIEW_SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) => `Consolidated View API request successful | sbi=${messageOptions.sbi || 'unknown'}`
  },
  CONSOLIDATED_VIEW_PARTIAL_SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Partial success from Consolidated View API | sbi=${messageOptions.sbi || 'unknown'} | failedPaths=${messageOptions.failedPaths} | status=${messageOptions.statusCode || 'unknown'}`
  },
  CONSOLIDATED_VIEW_ADDRESS_FORMAT: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Address format for sbi=${messageOptions.sbi} is ${messageOptions.uprn ? 'structured' : 'unstructured'}, uprn=${messageOptions.uprn || 'not set'}`
  },
  SESSION_STATE_CLEAR_FAILED: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Failed to clear application state for slug=${messageOptions.slug}, sessionKey=${messageOptions.sessionKey}, error=${messageOptions.errorMessage}`
  },
  SESSION_STATE_KEY_PARSE_FAILED: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Failed to parse session key: error=${messageOptions.errorMessage}, path=${messageOptions.requestPath}`
  },
  SESSION_STATE_FETCH_FAILED: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Failed to fetch saved state: sessionKey=${messageOptions.sessionKey}, error=${messageOptions.errorMessage}, path=${messageOptions.requestPath}`
  },
  RATE_LIMIT_EXCEEDED: {
    level: 'warn',
    messageFunc: (messageOptions) =>
      `Rate limit exceeded: path=${messageOptions.path}, ip=${messageOptions.ip || 'unknown'}, userId=${messageOptions.userId || 'anonymous'}, userAgent=${messageOptions.userAgent || 'unknown'}`
  },
  STATE_SIZE_EXCEEDED: {
    level: 'warn',
    messageFunc: (messageOptions) =>
      `State payload size ${messageOptions.size} bytes exceeds limit of ${messageOptions.limit} bytes for sessionKey=${messageOptions.sessionKey}`
  }
}
