// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'

/**
 * @typedef {object} LandGrantsConfig
 * @property {string} grantCode
 * @property {string} grantsServiceApiEndpoint
 */

const landGrants = convict({
  grantCode: {
    doc: 'GAS Future RPS grant code',
    format: String,
    default: 'frps-private-beta',
    env: 'GAS_FRPS_GRANT_CODE'
  },
  grantsServiceApiEndpoint: {
    format: String,
    default: '',
    env: 'LAND_GRANTS_API_URL'
  },
  customerReferenceNumber: {
    doc: 'Customer Reference Number for the land grants forms',
    format: Number,
    default: 1100014934,
    env: 'DEFAULT_CRN'
  },
  mockSessionCurrentRelationshipId: {
    doc: 'Default currentRelationshipId for mock session data when DEFRA_ID is disabled',
    format: String,
    default: '1100014934',
    env: 'DEFAULT_CRN'
  },
  mockSessionRelationships: {
    doc: 'Default relationships array for mock session data when DEFRA_ID is disabled (colon-separated format)',
    format: String,
    default: '1104734543:123456789:Test Organisation:default-organisation-id:relationship:relationshipLoa',
    env: 'MOCK_SESSION_RELATIONSHIPS'
  }
})

landGrants.validate({ allowed: 'strict' })

export default landGrants
