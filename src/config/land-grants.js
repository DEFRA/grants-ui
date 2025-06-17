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
  enableSbiSelector: {
    doc: 'Enable SBI selector for the Future RPS grants service, test only',
    format: Boolean,
    default: false,
    env: 'SBI_SELECTOR_ENABLED'
  },
  grantsServiceApiEndpoint: {
    format: String,
    default: '',
    env: 'LAND_GRANTS_API_URL'
  }
})

landGrants.validate({ allowed: 'strict' })

export default landGrants
