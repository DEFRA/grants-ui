/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const FORMS = {
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
}
