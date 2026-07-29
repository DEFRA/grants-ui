import { maskCrn } from '~/src/server/common/helpers/logging/mask-crn.js'

/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const AGREEMENTS = {
  AGREEMENT_LOAD: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Agreement loaded for CRN=${maskCrn(messageOptions.userId)}, agreementType=${messageOptions.agreementType}`
  },
  AGREEMENT_ACCEPTED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Agreement accepted by CRN=${maskCrn(messageOptions.userId)}, agreementType=${messageOptions.agreementType}`
  },
  AGREEMENT_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Agreement processing error for CRN=${maskCrn(messageOptions.userId)}: ${messageOptions.errorMessage}`
  },
  PROXY_RESPONSE_ERROR: {
    level: 'error',
    messageFunc: () => 'Proxy response is undefined. Possible upstream error or misconfiguration.'
  }
}
