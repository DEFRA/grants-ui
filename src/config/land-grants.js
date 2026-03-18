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
 * @property {boolean} enableHeferFeature
 * @property {boolean} enablePrintApplication
 */

const landGrants = convict({
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
  enableHeferFeature: {
    doc: 'Enable Hefer feature from 19/02/2026',
    format: Boolean,
    default: false,
    env: 'ENABLE_LAND_GRANT_HEFER_20260219'
  },
  enableUpl8And10: {
    doc: 'Enable UPL8 and UPL10 feature from 03/03/2026',
    format: Boolean,
    default: false,
    env: 'ENABLE_UPL_8_AND_10_20260303'
  },
  enablePrintApplication: {
    doc: 'Enable print submitted application feature from 11/03/2026',
    format: Boolean,
    default: false,
    env: 'ENABLE_FARM_PAYMENTS_PRINT_APPLICATION_20260311'
  }
})

landGrants.validate({ allowed: 'strict' })

export default landGrants
