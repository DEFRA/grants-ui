// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'

/**
 * @typedef {object} LandGrantsConfig
 * @property {string} grantCode
 * @property {string} grantsServiceApiEndpoint
 * @property {string} authToken
 * @property {string} encryptionKey
 * @property {boolean} enableSSSIFeature
 * @property {boolean} enableDetailedFarmDetails
 * @property {boolean} enableBlockingInvalidContactDetails
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
  authToken: {
    doc: 'Bearer token for authenticating with Land Grants Api',
    format: String,
    default: '',
    env: 'LAND_GRANTS_API_AUTH_TOKEN',
    sensitive: true
  },
  encryptionKey: {
    doc: 'Encryption key for securing bearer token transmission',
    format: String,
    default: '',
    env: 'LAND_GRANTS_API_ENCRYPTION_KEY',
    sensitive: true
  },
  enableSSSIFeature: {
    doc: 'Enable SSSI feature from 22/01/2026',
    format: Boolean,
    default: false,
    env: 'ENABLE_LAND_GRANT_SSSI_20260122'
  },
  enableDetailedFarmDetails: {
    doc: 'Enable detailed farm details feature from 09/02/2026',
    format: Boolean,
    default: true,
    env: 'ENABLE_DETAILED_FARM_DETAILS_20260209'
  },
  enableBlockingInvalidContactDetails: {
    doc: 'Enable blocking invalid contact details. User will not longer be able to proceed with the application if contact details are invalid.',
    format: Boolean,
    default: false,
    env: 'ENABLE_LAND_GRANT_BLOCK_INVALID_CONTACT_DETAIL_20260210'
  }
})

landGrants.validate({ allowed: 'strict' })

export default landGrants
