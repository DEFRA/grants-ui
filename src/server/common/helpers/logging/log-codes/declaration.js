import { maskCrn } from '~/src/server/common/helpers/logging/mask-crn.js'

/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const DECLARATION = {
  DECLARATION_LOAD: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Declaration page loaded for CRN=${maskCrn(messageOptions.userId)}, grantType=${messageOptions.grantType}`
  },
  DECLARATION_ACCEPTED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Declaration accepted by CRN=${maskCrn(messageOptions.userId)}, grantType=${messageOptions.grantType}`
  },
  DECLARATION_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Declaration processing error for CRN=${maskCrn(messageOptions.userId)}: ${messageOptions.errorMessage}`
  }
}
