/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const PERMISSIONS = {
  BYPASSED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Permission enforcement bypassed for grantCode=${messageOptions.grantCode}, permission=${messageOptions.permission}, userId=${messageOptions.userId}, authorised=${messageOptions.authorised}, path=${messageOptions.path}`
  },
  SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Permission check successful for grantCode=${messageOptions.grantCode}, permission=${messageOptions.permission}, userId=${messageOptions.userId}, authorised=${messageOptions.authorised}, path=${messageOptions.path}`
  },
  FAILURE: {
    level: 'warn',
    messageFunc: (messageOptions) =>
      `Permission check failed for grantCode=${messageOptions.grantCode}, permission=${messageOptions.permission}, userId=${messageOptions.userId}, authorised=${messageOptions.authorised}, path=${messageOptions.path}`
  }
}
