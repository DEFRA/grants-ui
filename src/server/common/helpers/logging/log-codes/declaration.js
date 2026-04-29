/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const DECLARATION = {
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
}
