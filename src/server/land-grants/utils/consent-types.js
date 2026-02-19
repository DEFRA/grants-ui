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
 * @typedef {object} ConsentTypeDefinition
 * @property {string} key - Short identifier used in consents arrays (e.g., 'sssi')
 * @property {string} apiField - Property name on the API action object (e.g., 'sssiConsentRequired')
 */
