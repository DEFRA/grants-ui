// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'

/**
 * @typedef {object} LandGrantsConfig
 * @property {string} grantCode
 * @property {string} grantsServiceApiEndpoint
 */

const config = convict({
  grantCode: {
    doc: 'GAS Future RPS grant code',
    format: String,
    default: '',
    env: 'GAS_FRPS_GRANT_CODE'
  },
  grantsServiceApiEndpoint: {
    format: String,
    default: '',
    env: 'LAND_GRANTS_API_URL'
  }
})

config.validate({ allowed: 'strict' })

export default config

/**
 * @import { Schema, SchemaObj } from 'convict'
 * @import { RedisConfig } from '~/src/server/common/helpers/redis-client.js'
 */
