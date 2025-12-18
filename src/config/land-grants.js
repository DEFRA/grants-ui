// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'

/**
 * @typedef {object} LandGrantsConfig
 * @property {string} grantCode
 * @property {string} grantsServiceApiEndpoint
 * @property {string} authToken
 * @property {string} encryptionKey
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
  }
})

landGrants.validate({ allowed: 'strict' })

export default landGrants
