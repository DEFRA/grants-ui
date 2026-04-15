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
 * @property {string[]} enabledActions
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
  enabledActions: {
    doc: 'Comma-separated list of action codes to show in the UI',
    format: Array,
    default: ['CMOR1', 'UPL1', 'UPL2', 'UPL3', 'UPL8', 'UPL10'],
    env: 'ENABLED_ACTIONS'
  }
})

landGrants.validate({ allowed: 'strict' })

export default landGrants
