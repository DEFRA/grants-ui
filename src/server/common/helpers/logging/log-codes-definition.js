/**
 * @namespace LogTypes
 * @typedef {"info"|"warn"|"error"|"debug"} LogTypes.LogLevel
 *
 * @typedef { Object } LogCodesDefinition
 * @property {LogTypes.LogLevel} level - The log level (e.g., 'info', 'warn', 'error', 'debug').
 * @property {(messageOptions: Object) => string} messageFunc - A function that takes message options and returns a formatted log message string.
 */

/**
 * @type {Object<string, Object<string, LogCodesDefinition>>}
 */
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
        `User sign-in failed for user=${messageOptions.userId || 'unknown'}. Error: ${messageOptions.errorMessage}`
    },
    SIGN_OUT: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `User sign-out for user=${messageOptions.userId}, session=${messageOptions.sessionId}`
    },
    TOKEN_VERIFICATION_SUCCESS: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Token verification successful for userCRN=${messageOptions.userId}, userSBI=${messageOptions.organisationId}`
    },
    TOKEN_VERIFICATION_FAILURE: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Token verification failed for user=${messageOptions.userId || 'unknown'}. Error: ${messageOptions.errorMessage}`
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
    },
    WHITELIST_ACCESS_GRANTED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Whitelist access granted to path=${messageOptions.path} for user=${messageOptions.userId || 'unknown'}, sbi=${messageOptions.sbi || 'N/A'}: ${messageOptions.validationType || 'validation passed'}`
    },
    WHITELIST_ACCESS_DENIED_BOTH: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Whitelist access denied to path=${messageOptions.path}: Both CRN ${messageOptions.userId || 'unknown'} and SBI ${messageOptions.sbi || 'unknown'} failed validation`
    },
    WHITELIST_ACCESS_DENIED_CRN_PASSED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Whitelist access denied to path=${messageOptions.path}: CRN ${messageOptions.userId || 'unknown'} passed but SBI ${messageOptions.sbi || 'unknown'} failed validation`
    },
    WHITELIST_ACCESS_DENIED_SBI_PASSED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Whitelist access denied to path=${messageOptions.path}: SBI ${messageOptions.sbi || 'unknown'} passed but CRN ${messageOptions.userId || 'unknown'} failed validation`
    },
    CREDENTIALS_MISSING: {
      level: 'error',
      messageFunc: () => 'No credentials received from Bell OAuth provider'
    },
    TOKEN_MISSING: {
      level: 'error',
      messageFunc: () => 'No token received from Defra Identity'
    },
    INVALID_STATE: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Invalid OAuth state provided | reason=${messageOptions.reason} | storedStatePresent=${messageOptions.storedStatePresent}`
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
      messageFunc: (messageOptions) =>
        `Form validation error in ${messageOptions.formName}: ${messageOptions.errorMessage}`
    },
    FORM_VALIDATION_SUCCESS: {
      level: 'info',
      messageFunc: (messageOptions) => `Form validation successful for ${messageOptions.formName}`
    },
    FORM_PROCESSING_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Form processing error for ${messageOptions.formName}: ${messageOptions.errorMessage}`
    },
    FORM_SAVE: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Form saved: ${messageOptions.formName} for user=${messageOptions.userId || 'unknown'}`
    },
    SLUG_STORED: {
      level: 'debug',
      messageFunc: (messageOptions) => `${messageOptions.controller}: Storing slug in context: ${messageOptions.slug}`
    },
    SLUG_RESOLVED: {
      level: 'debug',
      messageFunc: (messageOptions) => `${messageOptions.controller}: ${messageOptions.message}`
    }
  },
  SUBMISSION: {
    SUBMISSION_SUCCESS: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Grant submission successful for grantType=${messageOptions.grantType}, referenceNumber=${messageOptions.referenceNumber}`
    },
    SUBMISSION_COMPLETED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Form submission completed for grantType=${messageOptions.grantType}, referenceNumber=${messageOptions.referenceNumber}, fields=${messageOptions.numberOfFields || 0}, status=${messageOptions.status}`
    },
    SUBMISSION_FAILURE: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Grant submission failed for grantType=${messageOptions.grantType}, userCrn=${messageOptions.userCrn}, userSbi=${messageOptions.userSbi}, error=${messageOptions.errorMessage}`
    },
    SUBMISSION_VALIDATION_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Submission validation error for grantType=${messageOptions.grantType}, referenceNumber=${messageOptions.referenceNumber}, validationId=${messageOptions.validationId}`
    },
    SUBMISSION_PAYLOAD_LOG: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `Submission payload for grantType=${messageOptions.grantType}:\n${JSON.stringify(messageOptions.payload, null, 2)}`
    },
    SUBMISSION_REDIRECT_FAILURE: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Submission redirect failure for grantType=${messageOptions.grantType}, referenceNumber=${messageOptions.referenceNumber}. Error: ${messageOptions.errorMessage}`
    },
    VALIDATOR_NOT_FOUND: {
      level: 'error',
      messageFunc: (messageOptions) => `No validator found for grantType=${messageOptions.grantType}`
    },
    APPLICATION_STATUS_UPDATED: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `${messageOptions.controller}: Application status updated to ${messageOptions.status}`
    },
    SUBMISSION_PROCESSING: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `${messageOptions.controller}: Processing form submission, path=${messageOptions.path}`
    },
    SUBMISSION_REDIRECT: {
      level: 'debug',
      messageFunc: (messageOptions) => `${messageOptions.controller}: Redirecting to ${messageOptions.redirectPath}`
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
        `Declaration processing error for user=${messageOptions.userId}: ${messageOptions.errorMessage}`
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
        `Confirmation processing error for user=${messageOptions.userId}: ${messageOptions.errorMessage}`
    },
    SUBMITTED_STATUS_RETRIEVED: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `${messageOptions.controller}: Retrieved submitted status for referenceNumber=${messageOptions.referenceNumber}`
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
      messageFunc: (messageOptions) =>
        `Task processing error for ${messageOptions.taskName}: ${messageOptions.errorMessage}`
    },
    CONFIG_LOAD_SKIPPED: {
      level: 'debug',
      messageFunc: (messageOptions) =>
        `Tasklist config load skipped: tasklistId=${messageOptions.tasklistId}, error=${messageOptions.errorMessage}`
    },
    CACHE_RETRIEVAL_FAILED: {
      level: 'warn',
      messageFunc: (messageOptions) =>
        `Cache retrieval failed for sessionId=${messageOptions.sessionId}, using empty data. Error: ${messageOptions.errorMessage}`
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
        `Land grant processing error for user=${messageOptions.userId}: ${messageOptions.errorMessage}`
    },
    NO_LAND_PARCELS_FOUND: {
      level: 'warn',
      messageFunc: (messageOptions) => `No land parcels found for sbi=${messageOptions.sbi}`
    },
    NO_ACTIONS_FOUND: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `No actions found | parcelId: ${messageOptions.parcelId} | sheetId: ${messageOptions.sheetId}`
    },
    VALIDATE_APPLICATION_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Error validating application: ${messageOptions.errorMessage} | parcelId: ${messageOptions.parcelId} | sheetId: ${messageOptions.sheetId}`
    },
    FETCH_ACTIONS_ERROR: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Error fetching actions: ${messageOptions.errorMessage} | sbi: ${messageOptions.sbi} | parcelId: ${messageOptions.parcelId} | sheetId: ${messageOptions.sheetId}`
    },
    UNAUTHORISED_PARCEL: {
      level: 'error',
      messageFunc: (messageOptions) =>
        `Land parcel doesn't belong to sbi=${messageOptions.sbi} | selectedLandParcel: ${messageOptions.selectedLandParcel} | landParcelsForSbi=${JSON.stringify(messageOptions.landParcelsForSbi)}`
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
        `Agreement processing error for user=${messageOptions.userId}: ${messageOptions.errorMessage}`
    },
    PROXY_RESPONSE_ERROR: {
      level: 'error',
      messageFunc: () => 'Proxy response is undefined. Possible upstream error or misconfiguration.'
    }
  },
  COOKIES: {
    PAGE_LOAD: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Cookies page loaded: returnUrl=${messageOptions.returnUrl}, referer=${messageOptions.referer}`
    }
  },

  RESOURCE_NOT_FOUND: {
    FORM_NOT_FOUND: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Form not found: slug=${messageOptions.slug}, userId=${messageOptions.userId || 'anonymous'}, sbi=${messageOptions.sbi || 'unknown'}, reason=${messageOptions.reason || 'not_found'}, environment=${messageOptions.environment || 'unknown'}, referer=${messageOptions.referer || 'none'}`
    },
    TASKLIST_NOT_FOUND: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Tasklist not found: tasklistId=${messageOptions.tasklistId}, userId=${messageOptions.userId || 'anonymous'}, sbi=${messageOptions.sbi || 'unknown'}, reason=${messageOptions.reason || 'not_found'}, environment=${messageOptions.environment || 'unknown'}, referer=${messageOptions.referer || 'none'}`
    },
    PAGE_NOT_FOUND: {
      level: 'info',
      messageFunc: (messageOptions) =>
        `Page not found: path=${messageOptions.path}, userId=${messageOptions.userId || 'anonymous'}, sbi=${messageOptions.sbi || 'unknown'}, referer=${messageOptions.referer || 'none'}, userAgent=${messageOptions.userAgent || 'unknown'}`
    }
  },
  APPLICATION_LOCKS: {
    RELEASE_SKIPPED: {
      level: 'debug',
      messageFunc: ({ ownerId, reason }) => `Application locks release skipped | ownerId=${ownerId} | reason=${reason}`
    },
    RELEASE_ATTEMPTED: {
      level: 'debug',
      messageFunc: ({ ownerId }) => `Attempting application locks release | ownerId=${ownerId}`
    },
    RELEASE_SUCCEEDED: {
      level: 'debug',
      messageFunc: ({ ownerId, releasedCount }) =>
        `Application locks released | ownerId=${ownerId} | releasedCount=${releasedCount}`
    },
    RELEASE_TIMEOUT: {
      level: 'warn',
      messageFunc: ({ ownerId, timeoutMs }) =>
        `Application locks release timed out | ownerId=${ownerId} | timeoutMs=${timeoutMs}`
    },
    RELEASE_FAILED: {
      level: 'error',
      messageFunc: ({ ownerId, errorName, errorMessage }) =>
        `Failed to release application locks | ownerId=${ownerId} | errorName=${errorName} | errorMessage=${errorMessage}`
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
      messageFunc: (messageOptions) => `Server error occurred: ${messageOptions.errorMessage}`
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
      messageFunc: (messageOptions) =>
        `External API error for ${messageOptions.endpoint}: ${messageOptions.errorMessage}`
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
      messageFunc: (messageOptions) =>
        `Unexpected error fetching business data from Consolidated View API | sbi=${messageOptions.sbi || 'unknown'} | error=${messageOptions.errorMessage}`
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
    }
  }
}
