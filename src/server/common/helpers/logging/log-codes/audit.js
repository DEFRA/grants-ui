/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const AUDIT = {
  EVENT_PUBLISHED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Audit event published: messageId=${messageOptions.messageId}, entity=${messageOptions.entity}, action=${messageOptions.action}, entityid=${messageOptions.entityid}`
  },
  EVENT_PUBLISH_FAILED: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Failed to publish audit event for entityid=${messageOptions.entityid}: ${messageOptions.errorMessage}`
  }
}
