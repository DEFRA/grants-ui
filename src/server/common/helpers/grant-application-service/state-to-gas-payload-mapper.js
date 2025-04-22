/**
 * @typedef {object} GASMetadata
 * @property {string} [sbi] - Standard Business Identifier
 * @property {string} [frn] - FRN
 * @property {string} [crn] - Customer Reference Number
 * @property {string} [defraId] - Defra ID
 * @property {string} [clientRef] - Client Reference
 * @property {string} [submittedAt] - Submission date
 */

/**
 * @typedef {object} GASPayload
 * @property {GASMetadata} [metadata] - GAS Metadata
 * @property {object} [answers] - GAS Answers
 */

/**
 * Transforms FormContext object into a GAS Application payload for Land Grants.
 * @param {object} state - the DXT state object containing application details
 * @param {Function} transformAnswers - a function to transform the state object into the desired answers format
 * @returns {GASPayload}
 */
export const transformStateObjectToGasApplication = (
  state,
  transformAnswers
) => ({
  metadata: {
    sbi: state.sbi,
    frn: state.frn,
    crn: state.crn,
    defraId: state.defraId,
    clientRef: state.clientRef,
    submittedAt: new Date().toISOString()
  },
  answers: transformAnswers(state)
})
