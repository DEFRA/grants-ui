import { config } from '~/src/config/config.js'

/**
 * Registry of all consent/caveat types.
 * To add a new consent type, add a new entry to this array.
 * @return {ConsentTypeDefinition[]}
 */
export function getConsentTypes() {
  const enableSSSIFeature = config.get('landGrants.enableSSSIFeature')
  const enableHeferFeature = config.get('landGrants.enableHeferFeature')
  const consentTypes = []
  if (enableSSSIFeature) {
    consentTypes.push({ key: 'sssi', apiField: 'sssiConsentRequired' })
  }
  if (enableHeferFeature) {
    consentTypes.push({ key: 'hefer', apiField: 'heferRequired' })
  }
  return consentTypes
}

/**
 * Consent type keys (from the feature-flagged getConsentTypes registry) that
 * apply to a single action, in registry order. Disabling a consent feature
 * flag hides its key in every caller at once: persisted state, group hints,
 * requirement text and the map lookup.
 * @param {Record<string, unknown>} action
 * @returns {string[]}
 */
export function getActionConsentKeys(action) {
  return getConsentTypes()
    .filter((ct) => action[ct.apiField])
    .map((ct) => ct.key)
}

/**
 * The union of consent type keys required by at least one of the supplied
 * actions, e.g. ['sssi', 'hefer']. Each key appears once, in registry order
 * whatever order the actions arrive in.
 * @param {Array<Record<string, unknown>>} actions
 * @returns {string[]}
 */
export function getRequiredActionConsents(actions) {
  return getConsentTypes()
    .filter((ct) => actions.some((action) => action[ct.apiField]))
    .map((ct) => ct.key)
}

/**
 * @typedef {object} ConsentTypeDefinition
 * @property {string} key - Short identifier used in consents arrays (e.g., 'sssi')
 * @property {string} apiField - Property name on the API action object (e.g., 'sssiConsentRequired')
 */
