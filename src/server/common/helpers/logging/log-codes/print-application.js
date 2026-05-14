/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const PRINT_APPLICATION = {
  SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) => `Print application viewed for referenceNumber=${messageOptions.referenceNumber}`
  },
  ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Print application error for user=${messageOptions.userId}, slug=${messageOptions.slug}: ${messageOptions.errorMessage}`
  }
}
