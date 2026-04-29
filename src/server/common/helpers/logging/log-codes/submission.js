/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const SUBMISSION = {
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
}
