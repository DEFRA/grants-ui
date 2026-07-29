import { maskCrn } from '~/src/server/common/helpers/logging/mask-crn.js'

/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const CONFIRMATION = {
  CONFIRMATION_LOAD: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Confirmation page loaded for CRN=${maskCrn(messageOptions.userId)}, grantType=${messageOptions.grantType}`
  },
  CONFIRMATION_SUCCESS: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Confirmation processed successfully for CRN=${maskCrn(messageOptions.userId)}, referenceNumber=${messageOptions.referenceNumber}`
  },
  CONFIRMATION_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Confirmation processing error for CRN=${maskCrn(messageOptions.userId)}: ${messageOptions.errorMessage}`
  },
  SUBMITTED_STATUS_RETRIEVED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `${messageOptions.controller}: Retrieved submitted status for referenceNumber=${messageOptions.referenceNumber}`
  }
}
