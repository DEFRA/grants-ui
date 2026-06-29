import semver from 'semver'

/**
 * @typedef {object} GASMetadata
 * @property {string} [sbi] - Standard Business Identifier
 * @property {string} [frn] - FRN
 * @property {string} [crn] - Customer Reference Number
 * @property {string} [clientRef] - Client Reference
 * @property {string} [configVersion] - Grant configuration version
 * @property {string} [submittedAt] - Submission date
 */

/**
 * @typedef {object} GASPayload
 * @property {GASMetadata} [metadata] - GAS Metadata
 * @property {object} [answers] - GAS Answers
 */

/**
 * @param {unknown} configVersion - the grant configuration version to validate
 * @returns {void}
 */
const assertSemverConfigVersion = (configVersion) => {
  const parsed = typeof configVersion === 'string' ? semver.parse(configVersion) : null

  const isStrict =
    parsed !== null && parsed.prerelease.length === 0 && parsed.build.length === 0 && parsed.version === configVersion

  if (!isStrict) {
    throw new Error('Invalid grant config version, it must be a strict semver string (major.minor.patch)')
  }
}

/**
 * Resolves the grant configuration version to send to GAS.
 * @param {AnyRequest} request - Hapi request
 * @returns {string}
 */
export const resolveGasConfigVersion = (request) => {
  const configVersion = request?.app?.model?.def?.metadata?.version ?? '1.0.0'

  assertSemverConfigVersion(configVersion)

  return /** @type {string} */ (configVersion)
}

/**
 * Transforms FormContext object into a GAS Application payload for Land Grants.
 * @param {object} identifiers - identifiers object containing id details
 * @param {string} identifiers.sbi - Single Business Identifier
 * @param {string} identifiers.crn - Customer Reference Number
 * @param {string} identifiers.frn - Firm Reference Number
 * @param {string} identifiers.clientRef - Client reference to be sent to GAS to track applications
 * @param {object} state - the DXT state object containing application details
 * @param {Function} transformAnswers - a function to transform the state object into the desired answers format
 * @param {unknown} configVersion - the grant configuration version
 * @returns {GASPayload}
 */
export const transformStateObjectToGasApplication = (identifiers, state, transformAnswers, configVersion) => {
  assertSemverConfigVersion(configVersion)
  const semverConfigVersion = /** @type {string} */ (configVersion)

  return {
    metadata: {
      ...identifiers,
      configVersion: semverConfigVersion,
      submittedAt: new Date().toISOString()
    },
    answers: transformAnswers(state)
  }
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 */
