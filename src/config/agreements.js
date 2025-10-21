// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'

/**
 * @typedef {object} AgreementsConfig
 * @property {string} uiToken
 * @property {string} uiUrl
 * @property {string} baseUrl
 * @property {string} jwtSecret
 */

const agreements = convict({
  uiToken: {
    doc: 'Agreements UI token',
    format: String,
    default: 'default-agreements-ui-token',
    env: 'AGREEMENTS_UI_TOKEN'
  },
  uiUrl: {
    doc: 'Agreements UI URL',
    format: String,
    default: 'http://localhost:3000',
    env: 'AGREEMENTS_UI_URL'
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
