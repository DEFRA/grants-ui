import addFormatsModule from 'ajv-formats'
import AjvModule from 'ajv/dist/2020.js'
import fs from 'node:fs'
import path from 'node:path'
import { log } from '~/src/server/common/helpers/logging/log.js'
import { LogCodes } from '~/src/server/common/helpers/logging/log-codes.js'

const SCHEMAS_BASE_PATH = './src/server/common/forms/schemas'

const Ajv2020 = AjvModule.default || AjvModule
const addFormats = addFormatsModule.default || addFormatsModule

const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  removeAdditional: 'all',
  useDefaults: true
})
addFormats(ajv, ['date-time', 'date', 'time', 'duration', 'email', 'uri'])

const validators = new Map()

/**
 * Compiles and caches the AJV validator for a grant's submission schema the
 * first time it's needed. The schema path comes from the form definition's
 * own metadata (resolved per-request from grants-ui-backend); only the schema
 * file itself lives locally in this repo.
 * @param {string} schemaPath - `metadata.submission.submissionSchemaPath` from the form definition
 * @returns {import('ajv').ValidateFunction}
 */
function getOrCompileValidator(schemaPath) {
  // Keyed by schema path: the compiled validator is determined solely by the
  // schema file, and a grant's definition may point at a different schema in
  // a later version.
  const cached = validators.get(schemaPath)
  if (cached) {
    return cached
  }

  const fullSchemaPath = path.resolve(SCHEMAS_BASE_PATH, path.basename(schemaPath))
  const schema = JSON.parse(fs.readFileSync(fullSchemaPath, 'utf8'))
  const validate = ajv.compile(schema)

  validators.set(schemaPath, validate)
  return validate
}

/**
 * Validates a submission payload against the grant's JSON schema using AJV.
 * The schema enforces property types and its `required` list; AJV is configured
 * with `removeAdditional: 'all'`, so properties not declared in the schema are
 * stripped from the returned value.
 * @param {object} payload - The submission answers to validate
 * @param {string} grantCode - The grant code whose schema to validate against
 * @param {string} schemaPath - `metadata.submission.submissionSchemaPath` from the resolved form definition
 * @returns {{valid: true, value: object} | {valid: false, errors: import('ajv').ErrorObject[] | null | undefined}} AJV validation result
 */
export function validateSubmissionAnswers(payload, grantCode, schemaPath) {
  if (!schemaPath) {
    log(LogCodes.SUBMISSION.VALIDATOR_NOT_FOUND, { grantCode })
    throw new Error(`No validator found for grantCode: ${grantCode}`)
  }

  const validate = getOrCompileValidator(schemaPath)
  const valid = validate(payload)
  if (!valid) {
    return { valid: false, errors: validate.errors }
  }
  return { valid: true, value: payload }
}
