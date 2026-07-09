/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const PURGE = {
  STATE_CLEAR_SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) => `Purged application state cleared successfully for grant=${messageOptions.slug}`
  },

  STATE_CLEAR_FAILURE: {
    level: 'warn',
    messageFunc: (messageOptions) =>
      `Failed to clear purged application state for grant=${messageOptions.slug}, error=${messageOptions.errorMessage}`
  }
}
