import Joi from 'joi'

/**
 * Joi schema definitions for GAS application payload validation
 */

const actionAreaSchema = Joi.object({
  unit: Joi.string(),
  quantity: Joi.number()
})

const actionApplicationSchema = Joi.object({
  parcelId: Joi.string(),
  sheetId: Joi.string(),
  code: Joi.string(),
  appliedFor: actionAreaSchema
})

const gasPayloadSchema = Joi.object({
  sbi: Joi.string(),
  frn: Joi.string(),
  crn: Joi.string(),
  defraId: Joi.string(),
  scheme: Joi.string(),
  year: Joi.number().integer(),
  hasCheckedLandIsUpToDate: Joi.boolean(),
  actionApplications: Joi.array().items(actionApplicationSchema)
})

const defaultValidationOptions = {
  presence: 'optional'
}

/**
 * Validates an object against the GASPayload schema structure
 * Only validates types of properties that are present, doesn't require any fields
 * @param {object} payload - The object to validate
 * @param {object} options - Joi validation options (optional)
 * @returns {object} - Joi validation result
 */
export function validateGasPayload(
  payload,
  options = defaultValidationOptions
) {
  return gasPayloadSchema.validate(payload, options)
}
