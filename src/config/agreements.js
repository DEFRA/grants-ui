// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'

/**
 * @typedef {object} AgreementsConfig
 * @property {string} agreementsApiToken
 * @property {string} agreementsApiUrl
 */

const agreements = convict({
  agreementsApiToken: {
    doc: 'Agreements API token',
    format: String,
    default: 'default-agreements-api-token',
    env: 'AGREEMENTS_API_TOKEN'
  },
  agreementsApiUrl: {
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
