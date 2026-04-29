/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const WOODLAND = {
  VALIDATE_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) => `Woodland validation error: ${messageOptions.errorMessage}`
  }
}
