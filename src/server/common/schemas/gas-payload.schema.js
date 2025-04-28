import Joi from 'joi'

/**
 * Joi schema definitions for generic GAS application payload validation
 */

const gasPayloadSchema = Joi.object({
  metadata: {
    clientRef: Joi.string(),
    sbi: Joi.string(),
    frn: Joi.string(),
    crn: Joi.string(),
    defraId: Joi.string(),
    submittedAt: Joi.string().isoDate()
  },
  answers: Joi.object().unknown(true)
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
