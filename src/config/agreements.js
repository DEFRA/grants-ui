// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'

/**
 * @typedef {object} AgreementsConfig
 * @property {string} apiToken
 * @property {string} apiUrl
 * @property {string} jwtSecret
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
  baseUrl: {
    doc: 'Agreements base URL',
    format: String,
    default: '/agreement',
    env: 'AGREEMENTS_BASE_URL'
  },
  jwtSecret: {
    doc: 'JWT Secret',
    format: String,
    default: 'default-agreements-jwt-secret',
    env: 'AGREEMENTS_JWT_SECRET'
  }
})

agreements.validate({ allowed: 'strict' })

export default agreements
