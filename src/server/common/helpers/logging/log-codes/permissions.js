import { maskCrn } from '~/src/server/common/helpers/logging/mask-crn.js'

/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const PERMISSIONS = {
  ACCESS_DENIED: {
    level: 'warn',
    messageFunc: (messageOptions) =>
      `Permission denied for resource=${messageOptions.resource}, permission=${messageOptions.permission}, CRN=${maskCrn(messageOptions.userId)}, path=${messageOptions.path}: ${messageOptions.errorMessage}`
  },
  BYPASSED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Permission enforcement bypassed for grantCode=${messageOptions.grantCode}, permission=${messageOptions.permission}, CRN=${maskCrn(messageOptions.userId)}, authorised=${messageOptions.authorised}, path=${messageOptions.path}`
  },
  SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Permission check successful for grantCode=${messageOptions.grantCode}, permission=${messageOptions.permission}, CRN=${maskCrn(messageOptions.userId)}, authorised=${messageOptions.authorised}, path=${messageOptions.path}`
  },
  FAILURE: {
    level: 'warn',
    messageFunc: (messageOptions) =>
      `Permission check failed for grantCode=${messageOptions.grantCode}, permission=${messageOptions.permission}, CRN=${maskCrn(messageOptions.userId)}, authorised=${messageOptions.authorised}, path=${messageOptions.path}`
  }
}
