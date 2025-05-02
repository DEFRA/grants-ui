import Joi from 'joi'

/**
 * Joi schema definitions for application answers validation
 */

const valueTextPair = Joi.object({
  value: Joi.string(),
  text: Joi.string()
})

const addressSchema = Joi.object({
  addressLine1: Joi.string(),
  addressLine2: Joi.string().allow(null),
  town: Joi.string(),
  county: Joi.string().allow(null),
  postcode: Joi.string()
})

const applicationAnswersSchema = Joi.object({
  $$__referenceNumber: Joi.string(),

  natureOfBusinessRadiosField: valueTextPair,
  legalStatusRadiosField: valueTextPair,
  countryYesNoField: Joi.boolean(),
  planningPermissionRadiosField: valueTextPair,
  projectStartRadiosField: valueTextPair,
  tenancyYesNoField: Joi.boolean(),
  smallerAbattoirYesNoField: Joi.boolean(),
  otherFarmersYesNoField: Joi.boolean(),

  projectItemsCheckboxesField: Joi.array().items(valueTextPair),
  storageRadiosField: valueTextPair,
  projectCostNumberField: Joi.number(),
  remainingCostsYesNoField: Joi.boolean(),
  produceProcessedRadiosField: valueTextPair,
  howAddingValueRadiosField: valueTextPair,
  projectImpactCheckboxesField: Joi.array().items(valueTextPair),
  mechanisationYesNoField: Joi.boolean(),
  manualLabourAmountRadiosField: valueTextPair,
  applyingRadiosField: valueTextPair,

  applicantFirstName: Joi.string(),
  applicantLastName: Joi.string(),
  applicantEmailAddress: Joi.string().email(),
  applicantConfirmEmailAddress: Joi.string().email(),
  applicantMobileNumber: Joi.string(),
  applicantLandlineNumber: Joi.string(),

  applicantBusinessAddress__addressLine1: Joi.string(),
  applicantBusinessAddress__addressLine2: Joi.string().allow(null),
  applicantBusinessAddress__town: Joi.string(),
  applicantBusinessAddress__county: Joi.string().allow(null),
  applicantBusinessAddress__postcode: Joi.string(),
  applicantProjectPostcode: Joi.string()
})

const defaultValidationOptions = {
  presence: 'optional'
}

/**
 * Validates an object against the applicationAnswersSchema
 * Only validates types of properties that are present, doesn't require any fields
 * @param {object} payload - The object to validate
 * @param {object} options - Joi validation options (optional)
 * @returns {object} - Joi validation result
 */
export function validateApplicationAnswers(
  payload,
  options = defaultValidationOptions
) {
  return applicationAnswersSchema.validate(payload, options)
}
