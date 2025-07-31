// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'

/**
 * @typedef {object} AgreementsConfig
 * @property {string} apiToken
 * @property {string} apiUrl
 * @property {string} jwtToken
 */

const agreements = convict({
  apiToken: {
    doc: 'Agreements API token',
    format: String,
    default: 'default-agreements-api-token',
    env: 'AGREEMENTS_API_TOKEN'
  },
  apiUrl: {
    format: String,
    default: 'http://localhost:3555',
    env: 'AGREEMENTS_API_URL'
  },
  jwtToken: {
    doc: 'JWT token',
    format: String,
    default: 'default-agreements-jwt-token',
    env: 'AGREEMENTS_JWT_TOKEN'
  }
})

agreements.validate({ allowed: 'strict' })

export default agreements
