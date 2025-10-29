import addFormatsModule from 'ajv-formats'
import AjvModule from 'ajv/dist/2020.js'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const SCHEMAS_BASE_PATH = './src/server/common/forms/schemas'
const DEFINITIONS_BASE_PATH = './src/server/common/forms/definitions'

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

export function loadSubmissionSchemaValidators() {
  // Load all YAML files in the grants folder
  const files = fs.readdirSync(DEFINITIONS_BASE_PATH).filter((f) => f.endsWith('.yaml'))

  for (const file of files) {
    const yamlPath = path.join(DEFINITIONS_BASE_PATH, file)
    const data = YAML.parse(fs.readFileSync(yamlPath, 'utf8'))

    const grantCode = data.metadata?.submission?.grantCode
    const schemaPath = data.metadata?.submission?.submissionSchemaPath

    if (!grantCode || !schemaPath) {
      continue
    }

    const fullSchemaPath = path.resolve(SCHEMAS_BASE_PATH, path.basename(schemaPath))
    const schema = JSON.parse(fs.readFileSync(fullSchemaPath, 'utf8'))
    const validate = ajv.compile(schema)

    validators.set(grantCode, validate)
  }
}

/**
 * Validates an object against the applicationAnswersSchema
 * Only validates types of properties that are present, doesn't require any fields
 * @param {object} payload - The object to validate
 * @param {string} grantCode - The object to validate
 * @returns {object} - Joi validation result
 */
export function validateSubmissionAnswers(payload, grantCode) {
  const validate = validators.get(grantCode)
  if (!validate) {
    throw new Error(`No validator found for grantCode: ${grantCode}`)
  }
  const valid = validate(payload)
  if (!valid) {
    return { valid: false, errors: validate.errors }
  }
  return { valid: true, value: payload }
}
