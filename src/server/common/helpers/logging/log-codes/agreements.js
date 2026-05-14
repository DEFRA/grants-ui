/**
 * @type {Object<string, import('./definition.js').LogCodesDefinition>}
 */
export const AGREEMENTS = {
  AGREEMENT_LOAD: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Agreement loaded for user=${messageOptions.userId}, agreementType=${messageOptions.agreementType}`
  },
  AGREEMENT_ACCEPTED: {
    level: 'info',
    messageFunc: (messageOptions) =>
      `Agreement accepted by user=${messageOptions.userId}, agreementType=${messageOptions.agreementType}`
  },
  AGREEMENT_ERROR: {
    level: 'error',
    messageFunc: (messageOptions) =>
      `Agreement processing error for user=${messageOptions.userId}: ${messageOptions.errorMessage}`
  },
  PROXY_RESPONSE_ERROR: {
    level: 'error',
    messageFunc: () => 'Proxy response is undefined. Possible upstream error or misconfiguration.'
  }
}
