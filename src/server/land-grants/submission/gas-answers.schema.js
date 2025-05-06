import Joi from 'joi'

/**
 * Joi schema definitions for GAS application land grant answers validation
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

const gasAnswersSchema = Joi.object({
  scheme: Joi.string(),
  agreementName: Joi.string(),
  year: Joi.number().integer(),
  hasCheckedLandIsUpToDate: Joi.boolean(),
  actionApplications: Joi.array().items(actionApplicationSchema)
})

const defaultValidationOptions = {
  presence: 'optional'
}

/**
 * Validates an object against the gasAnswersSchema structure
 * Only validates types of properties that are present, doesn't require any fields
 * @param {object} payload - The object to validate
 * @param {object} options - Joi validation options (optional)
 * @returns {object} - Joi validation result
 */
export function validateGasAnswersForLandGrants(
  payload,
  options = defaultValidationOptions
) {
  return gasAnswersSchema.validate(payload, options)
}
