// istanbul ignore file

import convict from 'convict'
import 'dotenv/config'

/**
 * @typedef {object} AgreementsConfig
 * @property {string} uiToken
 * @property {string} uiUrl
 * @property {string} baseUrl
 * @property {string} jwtSecret
 * @property {string} jwtIssuer
 * @property {string[]} jwtAudience
 * @property {number} jwtTtlSec
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
    env: 'AGREEMENTS_JWT_SECRET',
    sensitive: true
  },
  jwtIssuer: {
    doc: 'Value of the `iss` claim on the user context JWT sent to the agreements service',
    format: String,
    default: 'grants-ui',
    env: 'AGREEMENTS_JWT_ISSUER'
  },
  jwtAudience: {
    doc: 'Comma-separated list of `aud` claim values the user context JWT is issued for. Convict does not trim whitespace, so do not pad the separator',
    format: Array,
    default: ['agreements-ui', 'gas'],
    env: 'AGREEMENTS_JWT_AUDIENCE'
  },
  jwtTtlSec: {
    doc: 'Lifetime in seconds of the user context JWT sent to the agreements service',
    format: Number,
    default: 300,
    env: 'AGREEMENTS_JWT_TTL_SEC'
  }
})

agreements.validate({ allowed: 'strict' })

export default agreements
